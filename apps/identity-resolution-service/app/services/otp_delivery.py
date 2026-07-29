"""OTP delivery providers (email via Resend, SMTP for local, WhatsApp stub for M4)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import aiosmtplib
import httpx
import structlog
from email.message import EmailMessage

from app.core.config import Settings

logger = structlog.get_logger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class OtpDestination:
    phone_e164: str
    email: str | None = None


class OtpDeliveryError(Exception):
    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class OtpDeliveryProvider(ABC):
    """Channel-agnostic OTP sender. WhatsApp OTP plugs in here in M4."""

    @property
    @abstractmethod
    def channel(self) -> str:
        """Stable channel id: email | smtp | console | whatsapp."""

    @abstractmethod
    async def send_otp(self, destination: OtpDestination, otp: str) -> None:
        """Deliver OTP. May soft-fail in local/dev; raise OtpDeliveryError in strict envs."""


def _is_strict_environment(settings: Settings) -> bool:
    return settings.environment.lower() not in ("development", "test", "local")


def _mask_otp(otp: str) -> str:
    if len(otp) <= 2:
        return "**"
    return f"{'*' * (len(otp) - 2)}{otp[-2:]}"


def _otp_email_body(otp: str) -> str:
    return f"Your ReclaimAI verification code is {otp}. Valid for 5 minutes."


class ConsoleOtpProvider(OtpDeliveryProvider):
    """Local/unit-test stub — never calls an external network."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def channel(self) -> str:
        return "console"

    async def send_otp(self, destination: OtpDestination, otp: str) -> None:
        log_otp = otp if not _is_strict_environment(self._settings) else _mask_otp(otp)
        logger.info(
            "otp_dispatched",
            channel=self.channel,
            phone_suffix=destination.phone_e164[-4:],
            email=destination.email,
            otp=log_otp if not _is_strict_environment(self._settings) else None,
            otp_masked=_mask_otp(otp),
        )


class SmtpOtpProvider(OtpDeliveryProvider):
    """Dev fallback via Mailhog/SMTP. Soft-fails when SMTP is down in non-strict envs."""

    def __init__(self, *, host: str, port: int, sender: str, settings: Settings) -> None:
        self._host = host
        self._port = port
        self._sender = sender
        self._settings = settings

    @property
    def channel(self) -> str:
        return "smtp"

    async def send_otp(self, destination: OtpDestination, otp: str) -> None:
        to_addr = destination.email or f"sms:{destination.phone_e164}"
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = to_addr
        message["Subject"] = "ReclaimAI OTP"
        message.set_content(_otp_email_body(otp))

        try:
            await aiosmtplib.send(
                message,
                hostname=self._host,
                port=self._port,
                start_tls=False,
            )
        except Exception as exc:
            logger.warning("smtp_send_failed", error=str(exc))
            if _is_strict_environment(self._settings):
                raise OtpDeliveryError(
                    "SMTP OTP delivery failed",
                    retryable=True,
                ) from exc
            # Local dev: do not fail the request if Mailhog is down.

        log_kwargs: dict[str, object] = {
            "channel": self.channel,
            "phone_suffix": destination.phone_e164[-4:],
            "email": destination.email,
            "otp_masked": _mask_otp(otp),
        }
        if not _is_strict_environment(self._settings):
            log_kwargs["otp"] = otp
        logger.info("otp_dispatched", **log_kwargs)


class ResendEmailOtpProvider(OtpDeliveryProvider):
    """Email OTP via Resend HTTP API (hosted/demo primary path)."""

    def __init__(
        self,
        *,
        api_key: str,
        from_email: str,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
        api_url: str = RESEND_API_URL,
    ) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._settings = settings
        self._http_client = http_client
        self._api_url = api_url

    @property
    def channel(self) -> str:
        return "email"

    def _ensure_configured(self) -> None:
        if not self._api_key or not self._from_email:
            raise OtpDeliveryError(
                "Resend OTP is not configured (RESEND_API_KEY / OTP_FROM_EMAIL)",
                retryable=False,
            )

    async def send_otp(self, destination: OtpDestination, otp: str) -> None:
        if not destination.email:
            raise OtpDeliveryError("Email is required for email OTP delivery", retryable=False)

        try:
            self._ensure_configured()
        except OtpDeliveryError:
            if not _is_strict_environment(self._settings):
                logger.warning(
                    "resend_misconfigured_soft_fail",
                    phone_suffix=destination.phone_e164[-4:],
                    email=destination.email,
                )
                return
            raise

        payload = {
            "from": self._from_email,
            "to": [destination.email],
            "subject": "ReclaimAI verification code",
            "text": _otp_email_body(otp),
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            if self._http_client is not None:
                response = await self._http_client.post(
                    self._api_url,
                    json=payload,
                    headers=headers,
                )
            else:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        self._api_url,
                        json=payload,
                        headers=headers,
                    )
        except httpx.HTTPError as exc:
            logger.warning("resend_send_failed", error=str(exc))
            if _is_strict_environment(self._settings):
                raise OtpDeliveryError("Resend OTP delivery failed", retryable=True) from exc
            return

        if response.status_code >= 400:
            logger.warning(
                "resend_send_rejected",
                status_code=response.status_code,
                body=response.text[:200],
            )
            if _is_strict_environment(self._settings):
                raise OtpDeliveryError(
                    "Resend OTP delivery rejected",
                    retryable=response.status_code >= 500,
                )
            return

        logger.info(
            "otp_dispatched",
            channel=self.channel,
            phone_suffix=destination.phone_e164[-4:],
            email=destination.email,
            otp_masked=_mask_otp(otp),
        )


class WhatsAppOtpProvider(OtpDeliveryProvider):
    """Placeholder for M4 Meta WhatsApp OTP — not live in this milestone."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def channel(self) -> str:
        return "whatsapp"

    async def send_otp(self, destination: OtpDestination, otp: str) -> None:
        raise OtpDeliveryError(
            "WhatsApp OTP provider is not enabled yet (planned for M4)",
            retryable=False,
        )


def create_otp_delivery_provider(settings: Settings) -> OtpDeliveryProvider:
    """Select provider from OTP_PROVIDER (email|resend|smtp|console|whatsapp)."""
    name = (settings.otp_provider or "").strip().lower()
    if name in ("", "auto"):
        name = "smtp" if not _is_strict_environment(settings) else "resend"

    if name in ("email", "resend"):
        return ResendEmailOtpProvider(
            api_key=settings.resend_api_key,
            from_email=settings.otp_from_email or settings.smtp_from,
            settings=settings,
        )
    if name == "smtp":
        return SmtpOtpProvider(
            host=settings.smtp_host,
            port=settings.smtp_port,
            sender=settings.smtp_from,
            settings=settings,
        )
    if name in ("console", "stub", "dev"):
        return ConsoleOtpProvider(settings)
    if name == "whatsapp":
        return WhatsAppOtpProvider(settings)

    raise ValueError(f"Unknown OTP_PROVIDER: {settings.otp_provider!r}")
