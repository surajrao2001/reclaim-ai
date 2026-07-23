from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.errors import api_error
from app.services.database import Database
from app.services.margin_engine import DiscountPolicy

router = APIRouter(prefix="/v1/tenants", tags=["discount-policy"])


class DiscountPolicyBody(BaseModel):
    min_margin_pct: float = Field(ge=0, le=100)
    max_discount_pct: float = Field(ge=0, le=100)
    max_discount_rupees: float = Field(ge=0)
    food_cost_pct_of_gross: float = Field(ge=0, le=100)


def _policy_response(policy: DiscountPolicy) -> dict:
    return {
        "min_margin_pct": float(policy.min_margin_pct),
        "max_discount_pct": float(policy.max_discount_pct),
        "max_discount_rupees": float(policy.max_discount_rupees),
        "food_cost_pct_of_gross": float(policy.food_cost_pct_of_gross),
    }


@router.get("/{tenant_id}/settings/discount-policy")
async def get_discount_policy(tenant_id: UUID, request: Request) -> dict:
    db: Database = request.app.state.db
    policy = await db.get_policy(tenant_id)
    if policy is None:
        policy = await db.get_or_create_policy(tenant_id)
    return _policy_response(policy)


@router.put("/{tenant_id}/settings/discount-policy")
async def put_discount_policy(
    tenant_id: UUID,
    body: DiscountPolicyBody,
    request: Request,
) -> dict:
    db: Database = request.app.state.db
    policy = DiscountPolicy(
        min_margin_pct=Decimal(str(body.min_margin_pct)),
        max_discount_pct=Decimal(str(body.max_discount_pct)),
        max_discount_rupees=Decimal(str(body.max_discount_rupees)),
        food_cost_pct_of_gross=Decimal(str(body.food_cost_pct_of_gross)),
    )
    try:
        saved = await db.upsert_policy(tenant_id, policy)
    except Exception as exc:
        raise api_error(400, "POLICY_UPSERT_FAILED", str(exc)) from exc
    return _policy_response(saved)
