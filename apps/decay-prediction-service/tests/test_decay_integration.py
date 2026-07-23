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
            $5::jsonb, $6, NULL, $7
        )
        """,
        order_id,
        DEMO_TENANT,
        f"PET_DECAY_{uuid.uuid4().hex[:8]}",
        customer_id,
        '[{"id":"1","name":"Chicken Dum Biryani","quantity":1,"price":350},'
        '{"id":"2","name":"Garlic Naan","quantity":2,"price":100}]',
        Decimal("550.00"),
        datetime(2024, 6, 10, 12, 0, tzinfo=timezone.utc),
    )


@pytest.mark.asyncio
async def test_pipeline_upserts_habit_profile(client: AsyncClient) -> None:
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
    assert first["created"] is True
    assert first["decay_score"] == 0.5
    assert first["predicted_dow"] == 0  # Monday IST (12:00 UTC → 17:30 IST)
    assert first["predicted_hour"] == 17
    assert first["top_items"][0]["name"] == "Chicken Dum Biryani"
    assert first["avg_order_value"] == 550.0

    second = await pipeline.handle_identity_unmasked(envelope)
    assert second["status"] == "duplicate"

    count = await pool.fetchval(
        "SELECT COUNT(*) FROM offers.customer_habit_profiles WHERE customer_id = $1",
        customer_id,
    )
    assert count == 1


@pytest.mark.asyncio
async def test_recompute_habit_endpoint(client: AsyncClient) -> None:
    order_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    pool = app.state.db_pool
    await _seed_claimed_order(pool, order_id, customer_id)

    res = await client.post(
        f"/v1/customers/{customer_id}/recompute-habit",
        json={"aggregator_order_id": str(order_id), "tenant_id": str(DEMO_TENANT)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["customer_id"] == str(customer_id)
    assert body["decay_score"] == 0.5


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["service"] == "decay-prediction-service"
