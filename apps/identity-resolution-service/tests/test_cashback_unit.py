import hashlib
import hmac
from decimal import Decimal
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest

from app.core.config import Settings, assert_live_razorpayx_credentials
from app.services.cashback_service import CashbackService
from app.services.claim_jwt import sign_claim_jwt, verify_claim_jwt
from app.services.database import ClaimPayoutRow
from app.services.razorpayx import RazorpayXClient
from app.services.upi import mask_upi_vpa, normalize_upi_vpa


def test_normalize_upi_vpa() -> None:
    assert normalize_upi_vpa(" Name@UPI ") == "name@upi"
    with pytest.raises(ValueError):
        normalize_upi_vpa("not-an-upi")


def test_mask_upi_vpa() -> None:
    assert mask_upi_vpa("ab@okaxis") == "**@okaxis"
    assert "@" in mask_upi_vpa("surajrao@oksbi")


def test_verify_claim_jwt_roundtrip() -> None:
    customer_id = uuid4()
    claim_id = uuid4()
    order_id = uuid4()
    token = sign_claim_jwt(
        secret="test-secret",
        customer_id=customer_id,
        claim_id=claim_id,
        aggregator_order_id=order_id,
        ttl_seconds=300,
    )
    claims = verify_claim_jwt(secret="test-secret", token=token)
    assert claims.customer_id == customer_id
    assert claims.claim_id == claim_id


def test_verify_claim_jwt_rejects_bad_token() -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        verify_claim_jwt(secret="test-secret", token="not.a.jwt")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_cashback_mock_payout_success() -> None:
    claim_id = uuid4()
    customer_id = uuid4()
    order_id = uuid4()
    token = sign_claim_jwt(
        secret="test-secret",
        customer_id=customer_id,
        claim_id=claim_id,
        aggregator_order_id=order_id,
        ttl_seconds=300,
    )

    claim_row = ClaimPayoutRow(
        claim_id=claim_id,
        customer_id=customer_id,
        aggregator_order_id=order_id,
        cashback_amount=Decimal("100"),
        payout_status=None,
        upi_txn_ref=None,
        upi_vpa=None,
        payout_idempotency_key=None,
    )
    pending_row = ClaimPayoutRow(
        claim_id=claim_id,
        customer_id=customer_id,
        aggregator_order_id=order_id,
        cashback_amount=Decimal("100"),
        payout_status="pending",
        upi_txn_ref=None,
        upi_vpa="name@upi",
        payout_idempotency_key=f"claim:{claim_id}",
    )
    paid_row = ClaimPayoutRow(
        claim_id=claim_id,
        customer_id=customer_id,
        aggregator_order_id=order_id,
        cashback_amount=Decimal("100"),
        payout_status="paid",
        upi_txn_ref="mock_pout_abc",
        upi_vpa="name@upi",
        payout_idempotency_key=f"claim:{claim_id}",
    )

    db = MagicMock()
    db.get_claim_payout = AsyncMock(return_value=claim_row)
    db.mark_payout_pending = AsyncMock(return_value=pending_row)
    db.mark_payout_processing = AsyncMock(return_value=paid_row)
    db.update_payout_status = AsyncMock()

    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock()

    settings = Settings(
        claim_jwt_secret="test-secret",
        razorpayx_mock="true",
    )
    razorpayx = RazorpayXClient(settings)
    service = CashbackService(db, redis, razorpayx, settings)

    result = await service.initiate_payout(claim_jwt=token, upi_vpa_raw="Name@UPI")
    assert result["payout_status"] == "paid"
    assert result["upi_txn_ref"].startswith("mock_pout_") or result["upi_txn_ref"] == "mock_pout_abc"
    db.mark_payout_pending.assert_awaited()
    db.mark_payout_processing.assert_awaited()


@pytest.mark.asyncio
async def test_cashback_idempotent_when_already_paid() -> None:
    claim_id = uuid4()
    customer_id = uuid4()
    order_id = uuid4()
    token = sign_claim_jwt(
        secret="test-secret",
        customer_id=customer_id,
        claim_id=claim_id,
        aggregator_order_id=order_id,
        ttl_seconds=300,
    )
    claim_row = ClaimPayoutRow(
        claim_id=claim_id,
        customer_id=customer_id,
        aggregator_order_id=order_id,
        cashback_amount=Decimal("100"),
        payout_status="paid",
        upi_txn_ref="pout_existing",
        upi_vpa="name@upi",
        payout_idempotency_key=f"claim:{claim_id}",
    )
    db = MagicMock()
    db.get_claim_payout = AsyncMock(return_value=claim_row)
    redis = MagicMock()
    settings = Settings(claim_jwt_secret="test-secret", razorpayx_mock="true")
    service = CashbackService(db, redis, RazorpayXClient(settings), settings)

    result = await service.initiate_payout(claim_jwt=token, upi_vpa_raw="name@upi")
    assert result["upi_txn_ref"] == "pout_existing"
    assert result["payout_status"] == "paid"
    redis.set.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_marks_paid() -> None:
    claim_id = uuid4()
    claim_row = ClaimPayoutRow(
        claim_id=claim_id,
        customer_id=uuid4(),
        aggregator_order_id=uuid4(),
        cashback_amount=Decimal("100"),
        payout_status="processing",
        upi_txn_ref="pout_123",
        upi_vpa="name@upi",
        payout_idempotency_key=f"claim:{claim_id}",
    )
    db = MagicMock()
    db.get_claim_by_upi_txn_ref = AsyncMock(return_value=claim_row)
    db.update_payout_status = AsyncMock(return_value=claim_row)
    redis = MagicMock()
    settings = Settings(razorpayx_mock="true")
    service = CashbackService(db, redis, RazorpayXClient(settings), settings)

    await service.handle_webhook_event(payout_id="pout_123", provider_status="processed")
    db.update_payout_status.assert_awaited_with(claim_id=claim_id, status="paid")


def test_webhook_signature_helper() -> None:
    body = b'{"payout_id":"pout_1","status":"processed"}'
    secret = "whsec"
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert hmac.compare_digest(sig, expected)


def test_claim_jwt_payload_still_works() -> None:
    customer_id = uuid4()
    claim_id = uuid4()
    order_id = uuid4()
    token = sign_claim_jwt(
        secret="test-secret",
        customer_id=customer_id,
        claim_id=claim_id,
        aggregator_order_id=order_id,
        ttl_seconds=300,
    )
    payload = jwt.decode(token, "test-secret", algorithms=["HS256"])
    assert payload["scope"] == "cashback_claim"


def test_razorpayx_mock_defaults_true_when_key_empty() -> None:
    settings = Settings(
        razorpayx_mock=None,
        razorpayx_key_id="",
        _env_file=None,
    )
    assert settings.razorpayx_mock_enabled is True
    assert_live_razorpayx_credentials(settings)  # mock path — no raise


def test_razorpayx_mock_defaults_false_when_key_present() -> None:
    settings = Settings(
        razorpayx_mock=None,
        razorpayx_key_id="rzp_test_abc",
        razorpayx_key_secret="sec",
        razorpayx_account_number="acc",
        razorpayx_webhook_secret="whsec",
        _env_file=None,
    )
    assert settings.razorpayx_mock_enabled is False
    assert_live_razorpayx_credentials(settings)


def test_razorpayx_mock_false_requires_keys() -> None:
    settings = Settings(
        razorpayx_mock="false",
        razorpayx_key_id="",
        razorpayx_key_secret="",
        razorpayx_account_number="",
        razorpayx_webhook_secret="",
        _env_file=None,
    )
    assert settings.razorpayx_mock_enabled is False
    with pytest.raises(ValueError, match="RAZORPAYX_MOCK=false"):
        assert_live_razorpayx_credentials(settings)


def test_razorpayx_mock_false_ok_with_full_credentials() -> None:
    settings = Settings(
        razorpayx_mock="false",
        razorpayx_key_id="rzp_test_abc",
        razorpayx_key_secret="sec",
        razorpayx_account_number="2323230000000000",
        razorpayx_webhook_secret="whsec",
        _env_file=None,
    )
    assert settings.razorpayx_mock_enabled is False
    assert_live_razorpayx_credentials(settings)


def test_razorpayx_explicit_mock_true_even_with_keys() -> None:
    settings = Settings(
        razorpayx_mock="true",
        razorpayx_key_id="rzp_test_abc",
        _env_file=None,
    )
    assert settings.razorpayx_mock_enabled is True
    assert_live_razorpayx_credentials(settings)
