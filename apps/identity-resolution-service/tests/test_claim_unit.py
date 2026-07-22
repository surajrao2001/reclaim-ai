import jwt

import pytest

from app.services.claim_token import decode_claim_token, encode_claim_token
from app.services.phone import hash_phone_e164, normalize_phone_e164


def test_claim_token_roundtrip() -> None:
    token = encode_claim_token("pp_out_88219", "PET_ZOM_8831092")
    rest_id, order_id = decode_claim_token(token)
    assert rest_id == "pp_out_88219"
    assert order_id == "PET_ZOM_8831092"


def test_normalize_indian_mobile() -> None:
    assert normalize_phone_e164("9900000000") == "+919900000000"
    assert normalize_phone_e164("+919900000000") == "+919900000000"


def test_phone_hash_deterministic() -> None:
    h1 = hash_phone_e164("+919900000000", "secret")
    h2 = hash_phone_e164("+919900000000", "secret")
    assert h1 == h2
    assert h1 != hash_phone_e164("+919900000001", "secret")


def test_claim_jwt_payload() -> None:
    from uuid import uuid4

    from app.services.claim_jwt import sign_claim_jwt

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
    assert payload["sub"] == str(customer_id)
