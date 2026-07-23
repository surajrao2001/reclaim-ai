from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import asyncpg


@dataclass(frozen=True)
class OfferRow:
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    max_margin_safe_discount_pct: Decimal
    max_discount_rupees: Decimal
    favorite_dish_name: str
    generated_copy: str | None
    llm_model_used: str | None


class Database:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_offer(self, offer_id: UUID) -> OfferRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, tenant_id, customer_id, max_margin_safe_discount_pct,
                   max_discount_rupees, favorite_dish_name, generated_copy, llm_model_used
            FROM offers.offers
            WHERE id = $1
            LIMIT 1
            """,
            offer_id,
        )
        if row is None:
            return None
        return OfferRow(
            id=row["id"],
            tenant_id=row["tenant_id"],
            customer_id=row["customer_id"],
            max_margin_safe_discount_pct=Decimal(str(row["max_margin_safe_discount_pct"] or 0)),
            max_discount_rupees=Decimal(str(row["max_discount_rupees"] or 0)),
            favorite_dish_name=row["favorite_dish_name"] or "your usual order",
            generated_copy=row["generated_copy"],
            llm_model_used=row["llm_model_used"],
        )

    async def update_generated_copy(
        self,
        *,
        offer_id: UUID,
        generated_copy: str,
        llm_model_used: str,
    ) -> bool:
        """Persist copy if not already set. Returns True when this call wrote the row."""
        row = await self._pool.fetchrow(
            """
            UPDATE offers.offers
            SET generated_copy = $2, llm_model_used = $3
            WHERE id = $1 AND generated_copy IS NULL
            RETURNING id
            """,
            offer_id,
            generated_copy,
            llm_model_used,
        )
        return row is not None
