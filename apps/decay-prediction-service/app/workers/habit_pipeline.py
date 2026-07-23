from uuid import UUID

import structlog

from app.services.database import Database
from app.services.habit_engine import build_habit_prediction
from app.services.redis_idempotency import RedisIdempotency

logger = structlog.get_logger(__name__)


class HabitPipeline:
    def __init__(self, db: Database, idempotency: RedisIdempotency) -> None:
        self._db = db
        self._idempotency = idempotency

    async def handle_identity_unmasked(self, envelope: dict) -> dict:
        event_id = str(envelope.get("event_id") or "")
        tenant_id = UUID(str(envelope["tenant_id"]))
        payload = envelope.get("payload") or {}
        customer_id = UUID(str(payload["customer_id"]))
        aggregator_order_id = UUID(str(payload["aggregator_order_id"]))

        if event_id and await self._idempotency.already_processed(event_id):
            logger.info("duplicate_event_skipped", event_id=event_id)
            return {"status": "duplicate"}

        return await self._upsert_from_order(
            tenant_id=tenant_id,
            customer_id=customer_id,
            aggregator_order_id=aggregator_order_id,
            event_id=event_id or None,
        )

    async def recompute_habit(
        self,
        *,
        customer_id: UUID,
        aggregator_order_id: UUID | None = None,
        tenant_id: UUID | None = None,
    ) -> dict:
        if aggregator_order_id is not None:
            order = await self._db.get_order(aggregator_order_id)
        else:
            order = await self._db.get_latest_order_for_customer(customer_id)

        if order is None:
            logger.warning("order_not_found", customer_id=str(customer_id))
            return {"status": "error", "reason": "order_not_found"}

        resolved_tenant = tenant_id or order.tenant_id
        return await self._upsert_from_order(
            tenant_id=resolved_tenant,
            customer_id=customer_id,
            aggregator_order_id=order.id,
            event_id=None,
        )

    async def _upsert_from_order(
        self,
        *,
        tenant_id: UUID,
        customer_id: UUID,
        aggregator_order_id: UUID,
        event_id: str | None,
    ) -> dict:
        order = await self._db.get_order(aggregator_order_id)
        if order is None:
            logger.warning("order_not_found", order_id=str(aggregator_order_id))
            return {"status": "error", "reason": "order_not_found"}

        if order.tenant_id != tenant_id:
            logger.warning("tenant_mismatch", order_id=str(aggregator_order_id))
            return {"status": "error", "reason": "tenant_mismatch"}

        existing = await self._db.get_habit_profile(customer_id)
        prediction = build_habit_prediction(
            ordered_at=order.ordered_at,
            order_items=order.order_items,
            gross_amount=order.gross_amount,
            existing_avg=existing.avg_order_value if existing else None,
            existing_decay=existing.decay_score if existing else None,
            existing_updated_at=existing.updated_at if existing else None,
        )

        profile = await self._db.upsert_habit_profile(
            customer_id=customer_id,
            tenant_id=tenant_id,
            predicted_dow=prediction.predicted_dow,
            predicted_hour=prediction.predicted_hour,
            top_items=prediction.top_items,
            avg_order_value=prediction.avg_order_value,
            decay_score=prediction.decay_score,
        )

        if event_id:
            await self._idempotency.mark_processed(event_id)

        logger.info(
            "habit_profile_upserted",
            customer_id=str(customer_id),
            decay_score=float(profile.decay_score or 0),
            predicted_dow=profile.predicted_dow,
            predicted_hour=profile.predicted_hour,
        )

        return {
            "status": "ok",
            "customer_id": str(profile.customer_id),
            "predicted_dow": profile.predicted_dow,
            "predicted_hour": profile.predicted_hour,
            "top_items": profile.top_items,
            "avg_order_value": float(profile.avg_order_value or 0),
            "decay_score": float(profile.decay_score or 0),
            "created": existing is None,
        }
