from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog

from app.core.config import Settings
from app.services.database import Database
from app.services.kafka_producer import KafkaProducer
from app.services.margin_engine import compute_margin_ceiling, pick_favorite_dish
from app.services.redis_idempotency import RedisIdempotency

logger = structlog.get_logger(__name__)


class OfferPipeline:
    def __init__(
        self,
        db: Database,
        kafka: KafkaProducer,
        idempotency: RedisIdempotency,
        settings: Settings,
    ) -> None:
        self._db = db
        self._kafka = kafka
        self._idempotency = idempotency
        self._settings = settings

    async def handle_identity_unmasked(self, envelope: dict) -> dict:
        event_id = str(envelope.get("event_id") or "")
        tenant_id = UUID(str(envelope["tenant_id"]))
        payload = envelope.get("payload") or {}
        consent = bool(payload.get("consent_whatsapp"))
        customer_id = UUID(str(payload["customer_id"]))
        aggregator_order_id = UUID(str(payload["aggregator_order_id"]))
        trace_id = str(envelope.get("trace_id") or event_id)

        if event_id and await self._idempotency.already_processed(event_id):
            logger.info("duplicate_event_skipped", event_id=event_id)
            return {"status": "duplicate"}

        if not consent:
            if event_id:
                await self._idempotency.mark_processed(event_id)
            logger.info("consent_false_skipped", order_id=str(aggregator_order_id))
            return {"status": "skipped", "reason": "no_whatsapp_consent"}

        order = await self._db.get_order(aggregator_order_id)
        if order is None:
            logger.warning("order_not_found", order_id=str(aggregator_order_id))
            return {"status": "error", "reason": "order_not_found"}

        if order.tenant_id != tenant_id:
            logger.warning("tenant_mismatch", order_id=str(aggregator_order_id))
            return {"status": "error", "reason": "tenant_mismatch"}

        policy = await self._db.get_or_create_policy(tenant_id)
        result = compute_margin_ceiling(
            gross_amount=order.gross_amount,
            food_cost=order.food_cost,
            policy=policy,
        )
        if result.skipped:
            if event_id:
                await self._idempotency.mark_processed(event_id)
            logger.info(
                "offer_skipped",
                reason=result.skip_reason,
                order_id=str(aggregator_order_id),
            )
            return {"status": "skipped", "reason": result.skip_reason}

        favorite = pick_favorite_dish(order.order_items)
        scheduled_for = datetime.now(timezone.utc) + timedelta(
            hours=self._settings.offer_schedule_delay_hours
        )

        offer = await self._db.insert_offer_idempotent(
            tenant_id=tenant_id,
            customer_id=customer_id,
            source_order_id=aggregator_order_id,
            max_margin_safe_discount_pct=result.max_margin_safe_discount_pct,
            max_discount_rupees=result.max_discount_rupees,
            favorite_dish_name=favorite,
            scheduled_for=scheduled_for,
        )

        if offer.inserted:
            await self._kafka.publish_offer_ready(
                tenant_id=tenant_id,
                offer_id=offer.id,
                customer_id=customer_id,
                max_margin_safe_discount_pct=offer.max_margin_safe_discount_pct,
                max_discount_rupees=offer.max_discount_rupees,
                scheduled_for=offer.scheduled_for,
                favorite_dish_name=offer.favorite_dish_name,
                trace_id=trace_id,
                direct_order_url=f"{self._settings.claim_web_base_url}/o/{offer.id}",
            )
        else:
            logger.info("offer_already_exists", offer_id=str(offer.id))

        if event_id:
            await self._idempotency.mark_processed(event_id)

        return {
            "status": "ok",
            "offer_id": str(offer.id),
            "inserted": offer.inserted,
            "max_discount_rupees": float(offer.max_discount_rupees),
        }
