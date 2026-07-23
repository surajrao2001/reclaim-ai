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


async def _seed_offer(pool, offer_id: uuid.UUID, customer_id: uuid.UUID) -> None:
    phone = f"+9199{uuid.uuid4().hex[:8]}"
    order_id = uuid.uuid4()
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
        f"PET_COPY_{uuid.uuid4().hex[:8]}",
        customer_id,
        '[{"id":"1","name":"Chicken Dum Biryani","quantity":1,"price":350}]',
        Decimal("550.00"),
    )
    await pool.execute(
        """
        INSERT INTO offers.offers (
            id, tenant_id, customer_id, max_margin_safe_discount_pct,
            max_discount_rupees, favorite_dish_name, source_aggregator_order_id,
            status, scheduled_for
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'pending', NOW() + interval '24 hours'
        )
        """,
        offer_id,
        DEMO_TENANT,
        customer_id,
        Decimal("18.18"),
        Decimal("100.00"),
        "Chicken Dum Biryani",
        order_id,
    )


@pytest.mark.asyncio
async def test_pipeline_generates_template_copy(client: AsyncClient) -> None:
    offer_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    pool = app.state.db_pool
    await _seed_offer(pool, offer_id, customer_id)

    envelope = {
        "event_id": str(uuid.uuid4()),
        "event_type": "reclaimai.offer.ready.v1",
        "tenant_id": str(DEMO_TENANT),
        "trace_id": str(uuid.uuid4()),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "offer_id": str(offer_id),
            "customer_id": str(customer_id),
            "max_margin_safe_discount_pct": 18.18,
            "max_discount_rupees": 100.0,
            "favorite_dish_name": "Chicken Dum Biryani",
            "direct_order_url": f"http://localhost:3101/o/{offer_id}",
        },
    }

    pipeline = app.state.pipeline
    first = await pipeline.handle_offer_ready(envelope)
    assert first["status"] == "ok"
    assert first["llm_model_used"] == "template-static"
    assert first["prompt_version"] == "template.v1"
    assert first["selected_discount_value"] == 100.0
    assert "₹100" in first["message_body"]
    assert str(offer_id) in first["cta_url"]

    second = await pipeline.handle_offer_ready(envelope)
    assert second["status"] == "duplicate"

    row = await pool.fetchrow(
        "SELECT generated_copy, llm_model_used FROM offers.offers WHERE id = $1",
        offer_id,
    )
    assert row["generated_copy"] == first["message_body"]
    assert row["llm_model_used"] == "template-static"


@pytest.mark.asyncio
async def test_dev_generate_copy_endpoint(client: AsyncClient) -> None:
    offer_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    await _seed_offer(app.state.db_pool, offer_id, customer_id)

    res = await client.post(f"/v1/offers/{offer_id}/generate-copy")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["llm_model_used"] == "template-static"
