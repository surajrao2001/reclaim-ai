from fastapi import APIRouter, Request

from app.models.claim import ClaimOtpRequestBody, ClaimOtpVerifyBody
from app.services.claim_service import ClaimService

router = APIRouter(prefix="/v1/claim", tags=["claim"])


def get_claim_service(request: Request) -> ClaimService:
    return request.app.state.claim_service


@router.get("/context/{token}")
async def get_claim_context(token: str, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.get_context(token)


@router.post("/otp/request")
async def request_otp(body: ClaimOtpRequestBody, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.request_otp(body.claim_token, body.phone_e164)


@router.post("/otp/verify")
async def verify_otp(body: ClaimOtpVerifyBody, request: Request) -> dict:
    service = get_claim_service(request)
    return await service.verify_otp(
        body.claim_token,
        body.phone_e164,
        body.otp,
        body.consent_whatsapp,
    )
