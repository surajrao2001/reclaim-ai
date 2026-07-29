import hashlib
import hmac
import json

from fastapi import APIRouter, Header, Request

from app.core.errors import api_error
from app.models.claim import ClaimCashbackBody, ClaimOtpRequestBody, ClaimOtpVerifyBody
from app.services.cashback_service import CashbackService
from app.services.claim_service import ClaimService

router = APIRouter(prefix="/v1/claim", tags=["claim"])
webhook_router = APIRouter(prefix="/v1/webhooks/razorpayx", tags=["webhooks"])


def get_claim_service(request: Request) -> ClaimService:
    return request.app.state.claim_service


def get_cashback_service(request: Request) -> CashbackService:
    return request.app.state.cashback_service


@router.get("/context/{token}")
async def get_claim_context(token: str, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.get_context(token)


@router.post("/otp/request")
async def request_otp(body: ClaimOtpRequestBody, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.request_otp(body.claim_token, body.phone_e164, body.email)


@router.post("/otp/verify")
async def verify_otp(body: ClaimOtpVerifyBody, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.verify_otp(
        body.claim_token,
        body.phone_e164,
        body.otp,
        body.consent_whatsapp,
    )


@router.post("/cashback")
async def claim_cashback(
    body: ClaimCashbackBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise api_error(401, "CLAIM_JWT_INVALID", "Bearer claim JWT required")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise api_error(401, "CLAIM_JWT_INVALID", "Bearer claim JWT required")
    service = get_cashback_service(request)
    return await service.initiate_payout(claim_jwt=token, upi_vpa_raw=body.upi_vpa)


@webhook_router.post("/payout")
async def razorpayx_payout_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None, alias="X-Razorpay-Signature"),
) -> dict:
    raw = await request.body()
    secret = request.app.state.settings.razorpayx_webhook_secret
    if secret:
        if not x_razorpay_signature:
            raise api_error(401, "WEBHOOK_SIGNATURE_INVALID", "Missing webhook signature")
        expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_razorpay_signature):
            raise api_error(401, "WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature")

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise api_error(400, "WEBHOOK_PAYLOAD_INVALID", "Invalid JSON body") from exc

    payout_id, provider_status = _extract_payout_status(payload)
    if not payout_id or not provider_status:
        return {"ok": True}

    service = get_cashback_service(request)
    await service.handle_webhook_event(payout_id=payout_id, provider_status=provider_status)
    return {"ok": True}


def _extract_payout_status(payload: dict) -> tuple[str | None, str | None]:
    """Support RazorpayX event envelope and a simple test payload."""
    if isinstance(payload.get("payout_id"), str) and isinstance(payload.get("status"), str):
        return payload["payout_id"], payload["status"]

    entity = (
        payload.get("payload", {}).get("payout", {}).get("entity")
        if isinstance(payload.get("payload"), dict)
        else None
    )
    if isinstance(entity, dict):
        payout_id = entity.get("id")
        status = entity.get("status")
        if isinstance(payout_id, str) and isinstance(status, str):
            return payout_id, status
    return None, None
