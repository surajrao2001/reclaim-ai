"""Backward-compatible SMTP OTP helper. Prefer otp_delivery providers."""

from app.core.config import Settings
from app.services.otp_delivery import OtpDestination, SmtpOtpProvider


class SmsService:
    """Legacy wrapper around SmtpOtpProvider (Mailhog local path)."""

    def __init__(self, *, host: str, port: int, sender: str) -> None:
        settings = Settings()
        self._provider = SmtpOtpProvider(
            host=host,
            port=port,
            sender=sender,
            settings=settings,
        )

    async def send_otp(self, phone_e164: str, otp: str) -> None:
        await self._provider.send_otp(
            OtpDestination(phone_e164=phone_e164, email=None),
            otp,
        )
