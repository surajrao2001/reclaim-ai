import structlog
from email.message import EmailMessage

import aiosmtplib

logger = structlog.get_logger(__name__)


class SmsService:
    def __init__(self, *, host: str, port: int, sender: str) -> None:
        self._host = host
        self._port = port
        self._sender = sender

    async def send_otp(self, phone_e164: str, otp: str) -> None:
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = f"sms:{phone_e164}"
        message["Subject"] = "ReclaimAI OTP"
        message.set_content(f"Your ReclaimAI verification code is {otp}. Valid for 5 minutes.")

        try:
            await aiosmtplib.send(
                message,
                hostname=self._host,
                port=self._port,
                start_tls=False,
            )
        except Exception as exc:
            logger.warning("smtp_send_failed", error=str(exc))
            # Local dev: OTP is also logged; do not fail the request if Mailhog is down.

        logger.info("otp_dispatched", phone_suffix=phone_e164[-4:], otp=otp)
