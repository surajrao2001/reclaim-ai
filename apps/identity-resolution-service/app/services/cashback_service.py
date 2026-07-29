from uuid import UUID

import structlog
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.errors import api_error
from app.services.claim_jwt import verify_claim_jwt
from app.services.database import Database
from app.services.razorpayx import RazorpayXClient, RazorpayXError
from app.services.upi import mask_upi_vpa, normalize_upi_vpa

logger = structlog.get_logger(__name__)

_ACTIVE_STATUSES = frozenset({"pending", "processing", "paid"})


class CashbackService:
    def __init__(
        self,
        db: Database,
        redis: Redis,
        razorpayx: RazorpayXClient,
        settings: Settings,
    ) -> None:
        self._db = db
        self._redis = redis
        self._razorpayx = razorpayx
        self._settings = settings

    async def initiate_payout(
        self,
        *,
        claim_jwt: str,
        upi_vpa_raw: str,
        client_ip: str = "unknown",
    ) -> dict:
        claims = verify_claim_jwt(secret=self._settings.claim_jwt_secret, token=claim_jwt)
        await self._consume_rate_limits(claim_id=claims.claim_id, client_ip=client_ip)

        try:
            upi_vpa = normalize_upi_vpa(upi_vpa_raw)
        except ValueError as exc:
            raise api_error(400, "INVALID_UPI_VPA", "Enter a valid UPI ID (e.g. name@upi)") from exc

        claim = await self._db.get_claim_payout(claims.claim_id)
        if claim is None or claim.customer_id != claims.customer_id:
            raise api_error(404, "CLAIM_NOT_FOUND", "Claim not found for this token")

        if claim.payout_status in _ACTIVE_STATUSES and claim.upi_txn_ref:
            return {
                "claim_id": str(claim.claim_id),
                "payout_status": claim.payout_status,
                "cashback_amount_inr": float(claim.cashback_amount),
                "upi_txn_ref": claim.upi_txn_ref,
                "message": "Cashback already initiated for this claim",
            }

        if claim.payout_status in ("pending", "processing", "paid"):
            raise api_error(
                409,
                "PAYOUT_ALREADY_EXISTS",
                "Cashback payout already in progress or completed",
            )

        lock_key = f"cashback:payout:{claim.claim_id}"
        locked = await self._redis.set(lock_key, "1", nx=True, ex=60 * 10)
        if not locked:
            latest = await self._db.get_claim_payout(claim.claim_id)
            if latest and latest.upi_txn_ref and latest.payout_status:
                return {
                    "claim_id": str(latest.claim_id),
                    "payout_status": latest.payout_status,
                    "cashback_amount_inr": float(latest.cashback_amount),
                    "upi_txn_ref": latest.upi_txn_ref,
                    "message": "Cashback already initiated for this claim",
                }
            raise api_error(
                409,
                "PAYOUT_ALREADY_EXISTS",
                "Cashback payout already in progress",
                retryable=True,
            )

        idempotency_key = f"claim:{claim.claim_id}"
        pending = await self._db.mark_payout_pending(
            claim_id=claim.claim_id,
            upi_vpa=upi_vpa,
            idempotency_key=idempotency_key,
        )
        if pending is None:
            await self._redis.delete(lock_key)
            latest = await self._db.get_claim_payout(claim.claim_id)
            if latest and latest.payout_status in _ACTIVE_STATUSES:
                raise api_error(
                    409,
                    "PAYOUT_ALREADY_EXISTS",
                    "Cashback payout already in progress or completed",
                )
            raise api_error(404, "CLAIM_NOT_FOUND", "Claim not found for this token")

        try:
            result = await self._razorpayx.create_upi_payout(
                claim_id=str(claim.claim_id),
                upi_vpa=upi_vpa,
                amount_inr=claim.cashback_amount,
            )
        except RazorpayXError as exc:
            await self._db.update_payout_status(claim_id=claim.claim_id, status="failed")
            await self._redis.delete(lock_key)
            logger.warning(
                "razorpayx_payout_failed",
                claim_id=str(claim.claim_id),
                error=str(exc),
                upi=mask_upi_vpa(upi_vpa),
            )
            raise api_error(
                502,
                "PAYOUT_PROVIDER_ERROR",
                "Unable to initiate UPI cashback right now",
                retryable=exc.retryable,
            ) from exc

        final_status = "paid" if self._settings.razorpayx_mock_enabled else "processing"
        if result.status in ("processed", "paid"):
            final_status = "paid"

        updated = await self._db.mark_payout_processing(
            claim_id=claim.claim_id,
            upi_txn_ref=result.payout_id,
            status=final_status,
        )
        assert updated is not None

        logger.info(
            "cashback_initiated",
            claim_id=str(claim.claim_id),
            status=final_status,
            upi=mask_upi_vpa(upi_vpa),
        )

        message = (
            "Cashback paid to your UPI ID"
            if final_status == "paid"
            else "Cashback initiated to your UPI ID"
        )
        return {
            "claim_id": str(updated.claim_id),
            "payout_status": updated.payout_status or final_status,
            "cashback_amount_inr": float(updated.cashback_amount),
            "upi_txn_ref": updated.upi_txn_ref or result.payout_id,
            "message": message,
        }

    async def handle_webhook_event(self, *, payout_id: str, provider_status: str) -> None:
        claim = await self._db.get_claim_by_upi_txn_ref(payout_id)
        if claim is None:
            logger.warning("razorpayx_webhook_unknown_payout", payout_id=payout_id)
            return

        mapped = _map_provider_status(provider_status)
        if mapped is None:
            logger.info(
                "razorpayx_webhook_ignored_status",
                payout_id=payout_id,
                status=provider_status,
            )
            return

        if claim.payout_status == mapped:
            return

        await self._db.update_payout_status(claim_id=claim.claim_id, status=mapped)
        logger.info(
            "cashback_status_updated",
            claim_id=str(claim.claim_id),
            status=mapped,
        )

    async def _consume_rate_limits(self, *, claim_id: UUID, client_ip: str) -> None:
        window = self._settings.cashback_rate_limit_window_seconds
        claim_key = f"cashback:ratelimit:claim:{claim_id}"
        claim_count = await self._redis.incr(claim_key)
        if claim_count == 1:
            await self._redis.expire(claim_key, window)
        if claim_count > self._settings.cashback_rate_limit_max_per_claim:
            raise api_error(
                429,
                "CASHBACK_RATE_LIMITED",
                "Too many cashback attempts for this claim. Try again later.",
                retryable=True,
            )

        ip = client_ip.strip() or "unknown"
        ip_key = f"cashback:ratelimit:ip:{ip}"
        ip_count = await self._redis.incr(ip_key)
        if ip_count == 1:
            await self._redis.expire(ip_key, window)
        if ip_count > self._settings.cashback_rate_limit_max_per_ip:
            raise api_error(
                429,
                "CASHBACK_RATE_LIMITED",
                "Too many cashback attempts from this network. Try again later.",
                retryable=True,
            )


def _map_provider_status(status: str) -> str | None:
    normalized = status.lower()
    if normalized in ("processed", "paid", "credited"):
        return "paid"
    if normalized in ("failed", "rejected", "cancelled", "reversed"):
        return "failed"
    if normalized in ("queued", "pending", "processing", "initiated"):
        return "processing"
    return None
