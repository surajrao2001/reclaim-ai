from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import asyncpg


@dataclass(frozen=True)
class ClaimContextRow:
    tenant_id: UUID
    tenant_name: str
    order_id: UUID
    petpooja_order_id: str
    gross_amount: Decimal
    already_claimed: bool
    existing_customer_id: UUID | None
    existing_claim_id: UUID | None


@dataclass(frozen=True)
class ClaimRecord:
    claim_id: UUID
    customer_id: UUID
    aggregator_order_id: UUID
    tenant_id: UUID


class Database:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_claim_context(
        self, petpooja_restaurant_id: str, petpooja_order_id: str
    ) -> ClaimContextRow | None:
        row = await self._pool.fetchrow(
            """
            SELECT
                t.id AS tenant_id,
                t.name AS tenant_name,
                ao.id AS order_id,
                ao.petpooja_order_id,
                ao.gross_amount,
                ic.id AS claim_id,
                ic.customer_id AS existing_customer_id
            FROM tenancy.tenants t
            JOIN commerce.aggregator_orders ao
              ON ao.tenant_id = t.id
             AND ao.petpooja_order_id = $2
            LEFT JOIN identity.identity_claims ic
              ON ic.aggregator_order_id = ao.id
            WHERE t.petpooja_restaurant_id = $1
            LIMIT 1
            """,
            petpooja_restaurant_id,
            petpooja_order_id,
        )
        if row is None:
            return None

        return ClaimContextRow(
            tenant_id=row["tenant_id"],
            tenant_name=row["tenant_name"],
            order_id=row["order_id"],
            petpooja_order_id=row["petpooja_order_id"],
            gross_amount=row["gross_amount"],
            already_claimed=row["claim_id"] is not None,
            existing_customer_id=row["existing_customer_id"],
            existing_claim_id=row["claim_id"],
        )

    async def get_claim_by_order_id(self, aggregator_order_id: UUID) -> ClaimRecord | None:
        row = await self._pool.fetchrow(
            """
            SELECT ic.id AS claim_id,
                   ic.customer_id,
                   ic.aggregator_order_id,
                   ao.tenant_id
            FROM identity.identity_claims ic
            JOIN commerce.aggregator_orders ao ON ao.id = ic.aggregator_order_id
            WHERE ic.aggregator_order_id = $1
            LIMIT 1
            """,
            aggregator_order_id,
        )
        if row is None:
            return None
        return ClaimRecord(
            claim_id=row["claim_id"],
            customer_id=row["customer_id"],
            aggregator_order_id=row["aggregator_order_id"],
            tenant_id=row["tenant_id"],
        )

    async def complete_claim(
        self,
        *,
        tenant_id: UUID,
        aggregator_order_id: UUID,
        phone_e164: str,
        consent_whatsapp: bool,
        cashback_amount: Decimal,
    ) -> ClaimRecord:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                customer_id = await conn.fetchval(
                    """
                    INSERT INTO identity.customers (tenant_id, phone_number, consent_whatsapp)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (tenant_id, phone_number)
                    DO UPDATE SET consent_whatsapp = EXCLUDED.consent_whatsapp
                    RETURNING id
                    """,
                    tenant_id,
                    phone_e164,
                    consent_whatsapp,
                )

                await conn.execute(
                    """
                    UPDATE commerce.aggregator_orders
                       SET customer_id = $2
                     WHERE id = $1
                    """,
                    aggregator_order_id,
                    customer_id,
                )

                claim_id = await conn.fetchval(
                    """
                    INSERT INTO identity.identity_claims (
                        aggregator_order_id,
                        customer_id,
                        otp_verified_at,
                        cashback_amount
                    ) VALUES ($1, $2, $3, $4)
                    RETURNING id
                    """,
                    aggregator_order_id,
                    customer_id,
                    datetime.now(timezone.utc),
                    cashback_amount,
                )

        return ClaimRecord(
            claim_id=claim_id,
            customer_id=customer_id,
            aggregator_order_id=aggregator_order_id,
            tenant_id=tenant_id,
        )
