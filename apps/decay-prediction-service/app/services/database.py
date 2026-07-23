import json
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import asyncpg


@dataclass(frozen=True)
class OrderRow:
    id: UUID
    tenant_id: UUID
    customer_id: UUID | None
    gross_amount: Decimal
    order_items: list[dict]
    ordered_at: datetime


@dataclass(frozen=True)
class HabitProfileRow:
    customer_id: UUID
    tenant_id: UUID
    predicted_dow: int | None
    predicted_hour: int | None
    top_items: list[dict]
    avg_order_value: Decimal | None
    decay_score: Decimal | None
    updated_at: datetime | None


def _parse_items(items: object) -> list[dict]:
    if isinstance(items, str):
        items = json.loads(items)
    elif items is None:
        items = []
    elif not isinstance(items, list):
        items = list(items)
    return list(items)


class Database:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_order(self, aggregator_order_id: UUID) -> OrderRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, tenant_id, customer_id, gross_amount, order_items, ordered_at
            FROM commerce.aggregator_orders
            WHERE id = $1
            LIMIT 1
            """,
            aggregator_order_id,
        )
        if row is None:
            return None

        return OrderRow(
            id=row["id"],
            tenant_id=row["tenant_id"],
            customer_id=row["customer_id"],
            gross_amount=Decimal(str(row["gross_amount"] or 0)),
            order_items=_parse_items(row["order_items"]),
            ordered_at=row["ordered_at"],
        )

    async def get_latest_order_for_customer(self, customer_id: UUID) -> OrderRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, tenant_id, customer_id, gross_amount, order_items, ordered_at
            FROM commerce.aggregator_orders
            WHERE customer_id = $1
            ORDER BY ordered_at DESC
            LIMIT 1
            """,
            customer_id,
        )
        if row is None:
            return None

        return OrderRow(
            id=row["id"],
            tenant_id=row["tenant_id"],
            customer_id=row["customer_id"],
            gross_amount=Decimal(str(row["gross_amount"] or 0)),
            order_items=_parse_items(row["order_items"]),
            ordered_at=row["ordered_at"],
        )

    async def get_habit_profile(self, customer_id: UUID) -> HabitProfileRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT customer_id, tenant_id, predicted_dow, predicted_hour,
                   top_items, avg_order_value, decay_score, updated_at
            FROM offers.customer_habit_profiles
            WHERE customer_id = $1
            LIMIT 1
            """,
            customer_id,
        )
        if row is None:
            return None

        return HabitProfileRow(
            customer_id=row["customer_id"],
            tenant_id=row["tenant_id"],
            predicted_dow=row["predicted_dow"],
            predicted_hour=row["predicted_hour"],
            top_items=_parse_items(row["top_items"]),
            avg_order_value=(
                Decimal(str(row["avg_order_value"]))
                if row["avg_order_value"] is not None
                else None
            ),
            decay_score=(
                Decimal(str(row["decay_score"])) if row["decay_score"] is not None else None
            ),
            updated_at=row["updated_at"],
        )

    async def upsert_habit_profile(
        self,
        *,
        customer_id: UUID,
        tenant_id: UUID,
        predicted_dow: int,
        predicted_hour: int,
        top_items: list[dict],
        avg_order_value: Decimal,
        decay_score: Decimal,
    ) -> HabitProfileRow:
        row = await self._pool.fetchrow(
            """
            INSERT INTO offers.customer_habit_profiles (
                customer_id, tenant_id, predicted_dow, predicted_hour,
                top_items, avg_order_value, decay_score, updated_at
            ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
            ON CONFLICT (customer_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                predicted_dow = EXCLUDED.predicted_dow,
                predicted_hour = EXCLUDED.predicted_hour,
                top_items = EXCLUDED.top_items,
                avg_order_value = EXCLUDED.avg_order_value,
                decay_score = EXCLUDED.decay_score,
                updated_at = NOW()
            RETURNING customer_id, tenant_id, predicted_dow, predicted_hour,
                      top_items, avg_order_value, decay_score, updated_at
            """,
            customer_id,
            tenant_id,
            predicted_dow,
            predicted_hour,
            json.dumps(top_items),
            avg_order_value,
            decay_score,
        )
        return HabitProfileRow(
            customer_id=row["customer_id"],
            tenant_id=row["tenant_id"],
            predicted_dow=row["predicted_dow"],
            predicted_hour=row["predicted_hour"],
            top_items=_parse_items(row["top_items"]),
            avg_order_value=(
                Decimal(str(row["avg_order_value"]))
                if row["avg_order_value"] is not None
                else None
            ),
            decay_score=(
                Decimal(str(row["decay_score"])) if row["decay_score"] is not None else None
            ),
            updated_at=row["updated_at"],
        )
