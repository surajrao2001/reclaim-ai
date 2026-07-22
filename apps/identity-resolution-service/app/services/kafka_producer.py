import json
import uuid
from datetime import datetime, timezone
from uuid import UUID

import structlog
from aiokafka import AIOKafkaProducer

logger = structlog.get_logger(__name__)

IDENTITY_UNMASKED_TOPIC = "reclaimai.identity.unmasked.v1"


class KafkaProducer:
    def __init__(self, producer: AIOKafkaProducer) -> None:
        self._producer = producer

    async def publish_identity_unmasked(
        self,
        *,
        tenant_id: UUID,
        customer_id: UUID,
        aggregator_order_id: UUID,
        consent_whatsapp: bool,
        phone_e164_hash: str,
        trace_id: str,
    ) -> str:
        event_id = str(uuid.uuid4())
        envelope = {
            "event_id": event_id,
            "event_type": IDENTITY_UNMASKED_TOPIC,
            "tenant_id": str(tenant_id),
            "trace_id": trace_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "customer_id": str(customer_id),
                "aggregator_order_id": str(aggregator_order_id),
                "consent_whatsapp": consent_whatsapp,
                "phone_e164_hash": phone_e164_hash,
            },
        }
        await self._producer.send_and_wait(
            IDENTITY_UNMASKED_TOPIC,
            json.dumps(envelope).encode("utf-8"),
            key=str(tenant_id).encode("utf-8"),
            headers=[
                ("trace_id", trace_id.encode("utf-8")),
                ("event_type", IDENTITY_UNMASKED_TOPIC.encode("utf-8")),
            ],
        )
        logger.info(
            "identity_unmasked_published",
            event_id=event_id,
            tenant_id=str(tenant_id),
        )
        return event_id
