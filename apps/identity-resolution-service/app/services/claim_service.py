from decimal import Decimal
from uuid import UUID, uuid4

import structlog

from app.core.config import Settings
from app.core.errors import api_error
from app.services.claim_jwt import sign_claim_jwt
from app.services.claim_token import InvalidClaimTokenError, decode_claim_token
from app.services.database import Database
from app.services.email_address import normalize_email
from app.services.kafka_producer import KafkaProducer
from app.services.otp import OtpService
from app.services.otp_delivery import OtpDeliveryError, OtpDeliveryProvider, OtpDestination
from app.services.phone import hash_phone_e164, normalize_phone_e164

logger = structlog.get_logger(__name__)


class ClaimService:
    def __init__(
        self,
        db: Database,
        otp: OtpService,
        otp_delivery: OtpDeliveryProvider,
        kafka: KafkaProducer,
        settings: Settings,
    ) -> None:
        self._db = db
        self._otp = otp
        self._otp_delivery = otp_delivery
        self._kafka = kafka
        self._settings = settings

    async def get_context(self, claim_token: str) -> dict:
        try:
            rest_id, petpooja_order_id = decode_claim_token(claim_token)
        except InvalidClaimTokenError as exc:
            raise api_error(404, "CLAIM_TOKEN_INVALID", str(exc)) from exc

        row = await self._db.get_claim_context(rest_id, petpooja_order_id)
        if row is None:
            raise api_error(
                404,
                "CLAIM_ORDER_NOT_FOUND",
                "No order found for this claim token",
            )

        return {
            "claim_token": claim_token,
            "tenant_name": row.tenant_name,
            "order_id": str(row.order_id),
            "petpooja_order_id": row.petpooja_order_id,
            "gross_amount": float(row.gross_amount),
            "cashback_amount_inr": self._settings.default_cashback_amount_inr,
            "already_claimed": row.already_claimed,
            "payout_status": row.payout_status,
        }

    async def request_otp(self, claim_token: str, phone: str, email: str) -> dict:
        await self.get_context(claim_token)

        try:
            phone_e164 = normalize_phone_e164(phone)
        except ValueError as exc:
            raise api_error(400, "INVALID_PHONE", "Phone number must be valid E.164 or Indian mobile") from exc

        try:
            email_norm = normalize_email(email)
        except ValueError as exc:
            raise api_error(400, "INVALID_EMAIL", "A valid email address is required for OTP delivery") from exc

        try:
            otp = await self._otp.issue_otp(claim_token, phone_e164)
        except PermissionError as exc:
            raise api_error(429, "OTP_RATE_LIMITED", str(exc), retryable=True) from exc

        try:
            await self._otp_delivery.send_otp(
                OtpDestination(phone_e164=phone_e164, email=email_norm),
                otp,
            )
        except OtpDeliveryError as exc:
            raise api_error(
                503,
                "OTP_DELIVERY_FAILED",
                str(exc),
                retryable=exc.retryable,
            ) from exc

        return {
            "expires_in_seconds": self._settings.otp_ttl_seconds,
            "delivery_channel": self._otp_delivery.channel,
        }

    async def verify_otp(
        self,
        claim_token: str,
        phone: str,
        otp: str,
        consent_whatsapp: bool,
    ) -> dict:
        context_response = await self.get_context(claim_token)
        order_id = context_response["order_id"]

        try:
            phone_e164 = normalize_phone_e164(phone)
        except ValueError as exc:
            raise api_error(400, "INVALID_PHONE", "Phone number must be valid E.164 or Indian mobile") from exc

        existing = await self._db.get_claim_by_order_id(UUID(order_id))
        if existing:
            existing_payout = await self._db.get_claim_payout(existing.claim_id)
            claim_jwt = sign_claim_jwt(
                secret=self._settings.claim_jwt_secret,
                customer_id=existing.customer_id,
                claim_id=existing.claim_id,
                aggregator_order_id=existing.aggregator_order_id,
                ttl_seconds=self._settings.claim_jwt_ttl_seconds,
            )
            payout_status = existing_payout.payout_status if existing_payout else None
            if payout_status == "paid":
                message = "This bill was already claimed and cashback was paid."
            elif payout_status in ("pending", "processing"):
                message = "This bill was already claimed — cashback is still processing."
            else:
                message = "Already verified. Enter your UPI ID to receive cashback."
            return {
                "claim_jwt": claim_jwt,
                "customer_id": str(existing.customer_id),
                "message": message,
                "payout_status": payout_status,
            }

        if not await self._otp.verify_otp(claim_token, phone_e164, otp):
            raise api_error(401, "OTP_INVALID", "OTP is invalid or expired")

        try:
            rest_id, petpooja_order_id = decode_claim_token(claim_token)
        except InvalidClaimTokenError as exc:
            raise api_error(404, "CLAIM_TOKEN_INVALID", str(exc)) from exc

        row = await self._db.get_claim_context(rest_id, petpooja_order_id)
        if row is None:
            raise api_error(404, "CLAIM_ORDER_NOT_FOUND", "No order found for this claim token")

        claim = await self._db.complete_claim(
            tenant_id=row.tenant_id,
            aggregator_order_id=row.order_id,
            phone_e164=phone_e164,
            consent_whatsapp=consent_whatsapp,
            cashback_amount=Decimal(str(self._settings.default_cashback_amount_inr)),
        )

        trace_id = str(uuid4())
        phone_hash = hash_phone_e164(phone_e164, self._settings.phone_hash_secret)
        await self._kafka.publish_identity_unmasked(
            tenant_id=row.tenant_id,
            customer_id=claim.customer_id,
            aggregator_order_id=claim.aggregator_order_id,
            consent_whatsapp=consent_whatsapp,
            phone_e164_hash=phone_hash,
            trace_id=trace_id,
        )

        claim_jwt = sign_claim_jwt(
            secret=self._settings.claim_jwt_secret,
            customer_id=claim.customer_id,
            claim_id=claim.claim_id,
            aggregator_order_id=claim.aggregator_order_id,
            ttl_seconds=self._settings.claim_jwt_ttl_seconds,
        )

        return {
            "claim_jwt": claim_jwt,
            "customer_id": str(claim.customer_id),
            "message": "Verified! Enter your UPI ID to receive cashback.",
            "payout_status": None,
        }
