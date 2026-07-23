import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from aiokafka import AIOKafkaProducer

logger = structlog.get_logger(__name__)

MESSAGE_GENERATED_TOPIC = "reclaimai.message.generated.v1"


class KafkaProducer:
    def __init__(self, producer: AIOKafkaProducer) -> None:
        self._producer = producer

    async def publish_message_generated(
        self,
        *,
        tenant_id: UUID,
        offer_id: UUID,
        message_body: str,
        selected_discount_value: Decimal,
        llm_model_used: str,
        prompt_version: str,
        cta_url: str,
        trace_id: str,
    ) -> str:
        event_id = str(uuid.uuid4())
        envelope = {
            "event_id": event_id,
            "event_type": MESSAGE_GENERATED_TOPIC,
            "tenant_id": str(tenant_id),
            "trace_id": trace_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "offer_id": str(offer_id),
                "message_body": message_body,
                "selected_discount_value": float(selected_discount_value),
                "llm_model_used": llm_model_used,
                "prompt_version": prompt_version,
                "cta_url": cta_url,
            },
        }
        await self._producer.send_and_wait(
            MESSAGE_GENERATED_TOPIC,
            json.dumps(envelope).encode("utf-8"),
            key=str(tenant_id).encode("utf-8"),
            headers=[
                ("trace_id", trace_id.encode("utf-8")),
                ("event_type", MESSAGE_GENERATED_TOPIC.encode("utf-8")),
            ],
        )
        logger.info(
            "message_generated_published",
            event_id=event_id,
            offer_id=str(offer_id),
        )
        return event_id
