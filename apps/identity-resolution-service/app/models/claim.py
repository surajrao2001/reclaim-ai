from pydantic import BaseModel, Field


class ClaimOtpRequestBody(BaseModel):
    claim_token: str = Field(min_length=1)
    phone_e164: str = Field(min_length=8)


class ClaimOtpVerifyBody(BaseModel):
    claim_token: str = Field(min_length=1)
    phone_e164: str = Field(min_length=8)
    otp: str = Field(min_length=4, max_length=8)
    consent_whatsapp: bool = False


class ClaimCashbackBody(BaseModel):
    upi_vpa: str = Field(min_length=5, max_length=320)
