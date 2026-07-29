from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.core.config import Settings
from app.models.claim import ClaimOtpRequestBody
from app.services.email_address import normalize_email
from app.services.otp_delivery import (
    ConsoleOtpProvider,
    OtpDeliveryError,
    OtpDestination,
    ResendEmailOtpProvider,
    WhatsAppOtpProvider,
    create_otp_delivery_provider,
)


def _settings(**overrides: object) -> Settings:
    base = {
        "environment": "development",
        "otp_provider": "console",
        "resend_api_key": "",
        "otp_from_email": "otp@reclaimai.local",
        "smtp_host": "localhost",
        "smtp_port": 1025,
        "smtp_from": "otp@reclaimai.local",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_normalize_email() -> None:
    assert normalize_email("  User@Example.COM ") == "user@example.com"
    with pytest.raises(ValueError):
        normalize_email("not-an-email")
    with pytest.raises(ValueError):
        normalize_email("missing-at.domain")


def test_claim_otp_request_body_requires_email() -> None:
    body = ClaimOtpRequestBody(
        claim_token="tok",
        phone_e164="+919900000000",
        email="visitor@example.com",
    )
    assert body.email == "visitor@example.com"
    with pytest.raises(Exception):
        ClaimOtpRequestBody(claim_token="tok", phone_e164="+919900000000")  # type: ignore[call-arg]


def test_provider_selection_resend_aliases() -> None:
    for name in ("email", "resend"):
        provider = create_otp_delivery_provider(_settings(otp_provider=name, resend_api_key="re_test"))
        assert provider.channel == "email"


def test_provider_selection_smtp_and_console() -> None:
    assert create_otp_delivery_provider(_settings(otp_provider="smtp")).channel == "smtp"
    assert create_otp_delivery_provider(_settings(otp_provider="console")).channel == "console"


def test_provider_selection_auto_by_environment() -> None:
    dev = create_otp_delivery_provider(_settings(otp_provider="auto", environment="development"))
    assert dev.channel == "smtp"
    prod = create_otp_delivery_provider(
        _settings(otp_provider="auto", environment="production", resend_api_key="re_x")
    )
    assert prod.channel == "email"


@pytest.mark.asyncio
async def test_whatsapp_stub_not_implemented() -> None:
    provider = WhatsAppOtpProvider(_settings())
    with pytest.raises(OtpDeliveryError) as exc:
        await provider.send_otp(
            OtpDestination(phone_e164="+919900000000", email="a@b.com"),
            "123456",
        )
    assert "M4" in str(exc.value)


@pytest.mark.asyncio
async def test_console_provider_soft_dispatches() -> None:
    provider = ConsoleOtpProvider(_settings(environment="development"))
    await provider.send_otp(
        OtpDestination(phone_e164="+919900000000", email="dev@example.com"),
        "654321",
    )


@pytest.mark.asyncio
async def test_resend_client_posts_email(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = '{"id":"email_1"}'

    async def fake_post(url: str, *, json: dict, headers: dict) -> FakeResponse:
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return FakeResponse()

    client = MagicMock()
    client.post = AsyncMock(side_effect=fake_post)

    provider = ResendEmailOtpProvider(
        api_key="re_test_key",
        from_email="OTP <otp@demo.reclaimai.local>",
        settings=_settings(environment="production"),
        http_client=client,
    )
    await provider.send_otp(
        OtpDestination(phone_e164="+919911223344", email="visitor@example.com"),
        "112233",
    )

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["json"] == {
        "from": "OTP <otp@demo.reclaimai.local>",
        "to": ["visitor@example.com"],
        "subject": "ReclaimAI verification code",
        "text": "Your ReclaimAI verification code is 112233. Valid for 5 minutes.",
    }
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_resend_soft_fails_when_misconfigured_in_dev() -> None:
    provider = ResendEmailOtpProvider(
        api_key="",
        from_email="otp@reclaimai.local",
        settings=_settings(environment="development"),
    )
    # Must not raise in local/dev
    await provider.send_otp(
        OtpDestination(phone_e164="+919900000000", email="visitor@example.com"),
        "999999",
    )


@pytest.mark.asyncio
async def test_resend_strict_requires_config() -> None:
    provider = ResendEmailOtpProvider(
        api_key="",
        from_email="otp@reclaimai.local",
        settings=_settings(environment="production"),
    )
    with pytest.raises(OtpDeliveryError) as exc:
        await provider.send_otp(
            OtpDestination(phone_e164="+919900000000", email="visitor@example.com"),
            "999999",
        )
    assert exc.value.retryable is False


@pytest.mark.asyncio
async def test_resend_rejects_http_errors_in_production() -> None:
    class FakeResponse:
        status_code = 500
        text = "boom"

    client = MagicMock()
    client.post = AsyncMock(return_value=FakeResponse())

    provider = ResendEmailOtpProvider(
        api_key="re_test",
        from_email="otp@demo.local",
        settings=_settings(environment="production"),
        http_client=client,
    )
    with pytest.raises(OtpDeliveryError) as exc:
        await provider.send_otp(
            OtpDestination(phone_e164="+919900000000", email="visitor@example.com"),
            "424242",
        )
    assert exc.value.retryable is True


@pytest.mark.asyncio
async def test_resend_network_error_soft_in_dev() -> None:
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.ConnectError("down"))

    provider = ResendEmailOtpProvider(
        api_key="re_test",
        from_email="otp@demo.local",
        settings=_settings(environment="development"),
        http_client=client,
    )
    await provider.send_otp(
        OtpDestination(phone_e164="+919900000000", email="visitor@example.com"),
        "424242",
    )


@pytest.mark.asyncio
async def test_claim_request_otp_validates_email() -> None:
    from decimal import Decimal
    from uuid import uuid4

    from fastapi import HTTPException

    from app.services.claim_service import ClaimService
    from app.services.claim_token import encode_claim_token

    db = MagicMock()
    db.get_claim_context = AsyncMock(
        return_value=MagicMock(
            tenant_name="Demo",
            order_id=uuid4(),
            petpooja_order_id="PET_1",
            gross_amount=Decimal("100"),
            already_claimed=False,
            payout_status=None,
            tenant_id=uuid4(),
        )
    )
    otp = MagicMock()
    otp.issue_otp = AsyncMock(return_value="123456")
    delivery = MagicMock()
    delivery.channel = "email"
    delivery.send_otp = AsyncMock()
    kafka = MagicMock()
    settings = _settings(otp_provider="email", resend_api_key="re_x")

    service = ClaimService(db, otp, delivery, kafka, settings)
    token = encode_claim_token("pp_out_88219", "PET_1")

    with pytest.raises(HTTPException) as exc:
        await service.request_otp(token, "+919900000000", "bad-email")
    assert exc.value.status_code == 400
    assert exc.value.detail["error"]["code"] == "INVALID_EMAIL"

    result = await service.request_otp(token, "+919900000000", "ok@example.com")
    assert result["delivery_channel"] == "email"
    assert result["expires_in_seconds"] == settings.otp_ttl_seconds
    delivery.send_otp.assert_awaited_once()
