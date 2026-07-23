from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core.errors import api_error
from app.workers.habit_pipeline import HabitPipeline

router = APIRouter(prefix="/v1/customers", tags=["habit"])


class RecomputeHabitBody(BaseModel):
    aggregator_order_id: UUID | None = None
    tenant_id: UUID | None = None


@router.post("/{customer_id}/recompute-habit")
async def recompute_habit(
    customer_id: UUID,
    request: Request,
    body: RecomputeHabitBody | None = None,
) -> dict:
    pipeline: HabitPipeline = request.app.state.pipeline
    payload = body or RecomputeHabitBody()
    try:
        result = await pipeline.recompute_habit(
            customer_id=customer_id,
            aggregator_order_id=payload.aggregator_order_id,
            tenant_id=payload.tenant_id,
        )
    except Exception as exc:
        raise api_error(500, "HABIT_RECOMPUTE_FAILED", str(exc), retryable=True) from exc

    if result.get("status") == "error":
        reason = result.get("reason", "unknown")
        code = "ORDER_NOT_FOUND" if reason == "order_not_found" else "HABIT_RECOMPUTE_FAILED"
        status = 404 if reason == "order_not_found" else 400
        raise api_error(status, code, reason)

    return result
