-- One-shot migration for existing local Postgres volumes (init-db.sql already applied).
-- Usage: docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai < scripts/migrate-margin.sql

CREATE TABLE IF NOT EXISTS tenancy.discount_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenancy.tenants(id),
    min_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    max_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    max_discount_rupees NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    food_cost_pct_of_gross NUMERIC(5, 2) NOT NULL DEFAULT 35.00,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE offers.offers ADD COLUMN IF NOT EXISTS max_discount_rupees NUMERIC(10, 2);
ALTER TABLE offers.offers ADD COLUMN IF NOT EXISTS favorite_dish_name TEXT;
ALTER TABLE offers.offers ADD COLUMN IF NOT EXISTS source_aggregator_order_id UUID
    REFERENCES commerce.aggregator_orders(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_source_order
    ON offers.offers (source_aggregator_order_id);

INSERT INTO tenancy.discount_policies (tenant_id)
VALUES ('11111111-1111-1111-1111-111111111111')
ON CONFLICT (tenant_id) DO NOTHING;
