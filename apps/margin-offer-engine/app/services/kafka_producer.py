import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from aiokafka import AIOKafkaProducer

logger = structlog.get_logger(__name__)

OFFER_READY_TOPIC = "reclaimai.offer.ready.v1"


class KafkaProducer:
    def __init__(self, producer: AIOKafkaProducer) -> None:
        self._producer = producer

    async def publish_offer_ready(
        self,
        *,
        tenant_id: UUID,
        offer_id: UUID,
        customer_id: UUID,
        max_margin_safe_discount_pct: Decimal,
        max_discount_rupees: Decimal,
        scheduled_for: datetime,
        favorite_dish_name: str,
        trace_id: str,
        direct_order_url: str | None = None,
    ) -> str:
        event_id = str(uuid.uuid4())
        scheduled = scheduled_for
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)

        envelope = {
            "event_id": event_id,
            "event_type": OFFER_READY_TOPIC,
            "tenant_id": str(tenant_id),
            "trace_id": trace_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "offer_id": str(offer_id),
                "customer_id": str(customer_id),
                "max_margin_safe_discount_pct": float(max_margin_safe_discount_pct),
                "max_discount_rupees": float(max_discount_rupees),
                "scheduled_for": scheduled.isoformat(),
                "favorite_dish_name": favorite_dish_name,
                "decay_score": None,
                "direct_order_url": direct_order_url,
            },
        }
        await self._producer.send_and_wait(
            OFFER_READY_TOPIC,
            json.dumps(envelope).encode("utf-8"),
            key=str(tenant_id).encode("utf-8"),
            headers=[
                ("trace_id", trace_id.encode("utf-8")),
                ("event_type", OFFER_READY_TOPIC.encode("utf-8")),
            ],
        )
        logger.info("offer_ready_published", event_id=event_id, offer_id=str(offer_id))
        return event_id
