import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="integration tests require RUN_INTEGRATION=1 and docker-compose",
)

DEMO_TENANT = uuid.UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
async def client():
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def _seed_claimed_order(pool, order_id: uuid.UUID, customer_id: uuid.UUID) -> None:
    phone = f"+9199{uuid.uuid4().hex[:8]}"
    await pool.execute(
        """
        INSERT INTO identity.customers (id, tenant_id, phone_number, consent_whatsapp)
        VALUES ($1, $2, $3, true)
        """,
        customer_id,
        DEMO_TENANT,
        phone,
    )
    await pool.execute(
        """
        INSERT INTO commerce.aggregator_orders (
            id, tenant_id, petpooja_order_id, aggregator, customer_id,
            order_items, gross_amount, food_cost, ordered_at
        ) VALUES (
            $1, $2, $3, 'zomato', $4,
            $5::jsonb, $6, NULL, NOW()
        )
        """,
        order_id,
        DEMO_TENANT,
        f"PET_MARGIN_{uuid.uuid4().hex[:8]}",
        customer_id,
        '[{"id":"1","name":"Chicken Dum Biryani","quantity":1,"price":350},'
        '{"id":"2","name":"Garlic Naan","quantity":2,"price":100}]',
        Decimal("550.00"),
    )


@pytest.mark.asyncio
async def test_policy_get_put(client: AsyncClient) -> None:
    get_res = await client.get(f"/v1/tenants/{DEMO_TENANT}/settings/discount-policy")
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["min_margin_pct"] == 25.0

    put_res = await client.put(
        f"/v1/tenants/{DEMO_TENANT}/settings/discount-policy",
        json={
            "min_margin_pct": 25,
            "max_discount_pct": 20,
            "max_discount_rupees": 100,
            "food_cost_pct_of_gross": 35,
        },
    )
    assert put_res.status_code == 200


@pytest.mark.asyncio
async def test_pipeline_creates_offer(client: AsyncClient) -> None:
    order_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    pool = app.state.db_pool
    await _seed_claimed_order(pool, order_id, customer_id)

    envelope = {
        "event_id": str(uuid.uuid4()),
        "event_type": "reclaimai.identity.unmasked.v1",
        "tenant_id": str(DEMO_TENANT),
        "trace_id": str(uuid.uuid4()),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "customer_id": str(customer_id),
            "aggregator_order_id": str(order_id),
            "consent_whatsapp": True,
        },
    }

    pipeline = app.state.pipeline
    first = await pipeline.handle_identity_unmasked(envelope)
    assert first["status"] == "ok"
    assert first["inserted"] is True
    assert first["max_discount_rupees"] == 100.0

    second = await pipeline.handle_identity_unmasked(envelope)
    assert second["status"] == "duplicate"

    count = await pool.fetchval(
        "SELECT COUNT(*) FROM offers.offers WHERE source_aggregator_order_id = $1",
        order_id,
    )
    assert count == 1


@pytest.mark.asyncio
async def test_no_consent_skips(client: AsyncClient) -> None:
    result = await app.state.pipeline.handle_identity_unmasked(
        {
            "event_id": str(uuid.uuid4()),
            "event_type": "reclaimai.identity.unmasked.v1",
            "tenant_id": str(DEMO_TENANT),
            "payload": {
                "customer_id": str(uuid.uuid4()),
                "aggregator_order_id": str(uuid.uuid4()),
                "consent_whatsapp": False,
            },
        }
    )
    assert result["status"] == "skipped"
    assert result["reason"] == "no_whatsapp_consent"
