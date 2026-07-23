import json
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from app.services.margin_engine import DiscountPolicy


@dataclass(frozen=True)
class OrderRow:
    id: UUID
    tenant_id: UUID
    customer_id: UUID | None
    gross_amount: Decimal
    food_cost: Decimal | None
    order_items: list[dict]


@dataclass(frozen=True)
class OfferRow:
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    max_margin_safe_discount_pct: Decimal
    max_discount_rupees: Decimal
    favorite_dish_name: str
    scheduled_for: datetime
    source_aggregator_order_id: UUID
    inserted: bool


class Database:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_order(self, aggregator_order_id: UUID) -> OrderRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, tenant_id, customer_id, gross_amount, food_cost, order_items
            FROM commerce.aggregator_orders
            WHERE id = $1
            LIMIT 1
            """,
            aggregator_order_id,
        )
        if row is None:
            return None

        items = row["order_items"]
        if isinstance(items, str):
            items = json.loads(items)
        elif items is None:
            items = []
        elif not isinstance(items, list):
            items = list(items)

        return OrderRow(
            id=row["id"],
            tenant_id=row["tenant_id"],
            customer_id=row["customer_id"],
            gross_amount=Decimal(str(row["gross_amount"] or 0)),
            food_cost=Decimal(str(row["food_cost"])) if row["food_cost"] is not None else None,
            order_items=list(items),
        )

    async def get_or_create_policy(self, tenant_id: UUID) -> DiscountPolicy:
        row = await self._pool.fetchrow(
            """
            INSERT INTO tenancy.discount_policies (tenant_id)
            VALUES ($1)
            ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
            RETURNING min_margin_pct, max_discount_pct, max_discount_rupees, food_cost_pct_of_gross
            """,
            tenant_id,
        )
        return DiscountPolicy(
            min_margin_pct=Decimal(str(row["min_margin_pct"])),
            max_discount_pct=Decimal(str(row["max_discount_pct"])),
            max_discount_rupees=Decimal(str(row["max_discount_rupees"])),
            food_cost_pct_of_gross=Decimal(str(row["food_cost_pct_of_gross"])),
        )

    async def get_policy(self, tenant_id: UUID) -> DiscountPolicy | None:
        row = await self._pool.fetchrow(
            """
            SELECT min_margin_pct, max_discount_pct, max_discount_rupees, food_cost_pct_of_gross
            FROM tenancy.discount_policies
            WHERE tenant_id = $1
            """,
            tenant_id,
        )
        if row is None:
            return None
        return DiscountPolicy(
            min_margin_pct=Decimal(str(row["min_margin_pct"])),
            max_discount_pct=Decimal(str(row["max_discount_pct"])),
            max_discount_rupees=Decimal(str(row["max_discount_rupees"])),
            food_cost_pct_of_gross=Decimal(str(row["food_cost_pct_of_gross"])),
        )

    async def upsert_policy(self, tenant_id: UUID, policy: DiscountPolicy) -> DiscountPolicy:
        row = await self._pool.fetchrow(
            """
            INSERT INTO tenancy.discount_policies (
                tenant_id, min_margin_pct, max_discount_pct,
                max_discount_rupees, food_cost_pct_of_gross, updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (tenant_id) DO UPDATE SET
                min_margin_pct = EXCLUDED.min_margin_pct,
                max_discount_pct = EXCLUDED.max_discount_pct,
                max_discount_rupees = EXCLUDED.max_discount_rupees,
                food_cost_pct_of_gross = EXCLUDED.food_cost_pct_of_gross,
                updated_at = NOW()
            RETURNING min_margin_pct, max_discount_pct, max_discount_rupees, food_cost_pct_of_gross
            """,
            tenant_id,
            policy.min_margin_pct,
            policy.max_discount_pct,
            policy.max_discount_rupees,
            policy.food_cost_pct_of_gross,
        )
        return DiscountPolicy(
            min_margin_pct=Decimal(str(row["min_margin_pct"])),
            max_discount_pct=Decimal(str(row["max_discount_pct"])),
            max_discount_rupees=Decimal(str(row["max_discount_rupees"])),
            food_cost_pct_of_gross=Decimal(str(row["food_cost_pct_of_gross"])),
        )

    async def insert_offer_idempotent(
        self,
        *,
        tenant_id: UUID,
        customer_id: UUID,
        source_order_id: UUID,
        max_margin_safe_discount_pct: Decimal,
        max_discount_rupees: Decimal,
        favorite_dish_name: str,
        scheduled_for: datetime,
    ) -> OfferRow:
        inserted = await self._pool.fetchrow(
            """
            INSERT INTO offers.offers (
                tenant_id, customer_id, max_margin_safe_discount_pct,
                max_discount_rupees, favorite_dish_name, source_aggregator_order_id,
                status, scheduled_for
            ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
            ON CONFLICT (source_aggregator_order_id) DO NOTHING
            RETURNING id, tenant_id, customer_id, max_margin_safe_discount_pct,
                      max_discount_rupees, favorite_dish_name, scheduled_for,
                      source_aggregator_order_id
            """,
            tenant_id,
            customer_id,
            max_margin_safe_discount_pct,
            max_discount_rupees,
            favorite_dish_name,
            source_order_id,
            scheduled_for,
        )
        if inserted:
            return OfferRow(
                id=inserted["id"],
                tenant_id=inserted["tenant_id"],
                customer_id=inserted["customer_id"],
                max_margin_safe_discount_pct=Decimal(str(inserted["max_margin_safe_discount_pct"])),
                max_discount_rupees=Decimal(str(inserted["max_discount_rupees"])),
                favorite_dish_name=inserted["favorite_dish_name"],
                scheduled_for=inserted["scheduled_for"],
                source_aggregator_order_id=inserted["source_aggregator_order_id"],
                inserted=True,
            )

        existing = await self._pool.fetchrow(
            """
            SELECT id, tenant_id, customer_id, max_margin_safe_discount_pct,
                   max_discount_rupees, favorite_dish_name, scheduled_for,
                   source_aggregator_order_id
            FROM offers.offers
            WHERE source_aggregator_order_id = $1
            LIMIT 1
            """,
            source_order_id,
        )
        if existing is None:
            raise RuntimeError("offer upsert conflict without existing row")

        return OfferRow(
            id=existing["id"],
            tenant_id=existing["tenant_id"],
            customer_id=existing["customer_id"],
            max_margin_safe_discount_pct=Decimal(str(existing["max_margin_safe_discount_pct"])),
            max_discount_rupees=Decimal(str(existing["max_discount_rupees"])),
            favorite_dish_name=existing["favorite_dish_name"],
            scheduled_for=existing["scheduled_for"],
            source_aggregator_order_id=existing["source_aggregator_order_id"],
            inserted=False,
        )
