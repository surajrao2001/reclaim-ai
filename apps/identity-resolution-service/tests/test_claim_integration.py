import os
import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.claim_token import encode_claim_token

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="integration tests require RUN_INTEGRATION=1 and docker-compose",
)


@pytest.fixture
async def client():
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def _ensure_test_order(pool, petpooja_order_id: str) -> None:
    tenant_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    await pool.execute(
        """
        INSERT INTO commerce.aggregator_orders (
            tenant_id, petpooja_order_id, aggregator, order_items,
            gross_amount, ordered_at
        ) VALUES ($1, $2, 'zomato', '[]'::jsonb, $3, NOW())
        ON CONFLICT (tenant_id, petpooja_order_id) DO NOTHING
        """,
        tenant_id,
        petpooja_order_id,
        Decimal("550.00"),
    )


@pytest.mark.asyncio
async def test_full_claim_flow(client: AsyncClient) -> None:
    order_id = f"PET_TEST_{uuid.uuid4().hex[:8]}"
    token = encode_claim_token("pp_out_88219", order_id)
    pool = app.state.db_pool
    await _ensure_test_order(pool, order_id)

    ctx = await client.get(f"/v1/claim/context/{token}")
    assert ctx.status_code == 200
    assert ctx.json()["petpooja_order_id"] == order_id

    phone = "+919911223344"
    req = await client.post(
        "/v1/claim/otp/request",
        json={
            "claim_token": token,
            "phone_e164": phone,
            "email": "visitor@example.com",
        },
    )
    assert req.status_code == 200

    otp = await app.state.claim_service._otp.peek_otp(token, phone)
    assert otp is not None

    verify = await client.post(
        "/v1/claim/otp/verify",
        json={
            "claim_token": token,
            "phone_e164": phone,
            "otp": otp,
            "consent_whatsapp": True,
        },
    )
    assert verify.status_code == 200
    body = verify.json()
    assert body["claim_jwt"]
    assert body["customer_id"]

    verify_again = await client.post(
        "/v1/claim/otp/verify",
        json={
            "claim_token": token,
            "phone_e164": phone,
            "otp": "000000",
            "consent_whatsapp": True,
        },
    )
    assert verify_again.status_code == 200

    claim_jwt = body["claim_jwt"]
    cashback = await client.post(
        "/v1/claim/cashback",
        headers={"Authorization": f"Bearer {claim_jwt}"},
        json={"upi_vpa": "demo@upi"},
    )
    assert cashback.status_code == 200
    cash_body = cashback.json()
    assert cash_body["payout_status"] in ("paid", "processing")
    assert cash_body["upi_txn_ref"]

    cashback_again = await client.post(
        "/v1/claim/cashback",
        headers={"Authorization": f"Bearer {claim_jwt}"},
        json={"upi_vpa": "demo@upi"},
    )
    assert cashback_again.status_code == 200
    assert cashback_again.json()["upi_txn_ref"] == cash_body["upi_txn_ref"]

    # Fresh claim for invalid VPA validation
    order_id_2 = f"PET_TEST_{uuid.uuid4().hex[:8]}"
    token_2 = encode_claim_token("pp_out_88219", order_id_2)
    await _ensure_test_order(pool, order_id_2)
    phone_2 = "+919911223355"
    await client.post(
        "/v1/claim/otp/request",
        json={
            "claim_token": token_2,
            "phone_e164": phone_2,
            "email": "visitor2@example.com",
        },
    )
    otp_2 = await app.state.claim_service._otp.peek_otp(token_2, phone_2)
    verify_2 = await client.post(
        "/v1/claim/otp/verify",
        json={
            "claim_token": token_2,
            "phone_e164": phone_2,
            "otp": otp_2,
            "consent_whatsapp": True,
        },
    )
    jwt_2 = verify_2.json()["claim_jwt"]
    bad_vpa = await client.post(
        "/v1/claim/cashback",
        headers={"Authorization": f"Bearer {jwt_2}"},
        json={"upi_vpa": "not-valid"},
    )
    assert bad_vpa.status_code == 400
    assert bad_vpa.json()["error"]["code"] == "INVALID_UPI_VPA"
