-- ReclaimAI local DB bootstrap (Phase 0)
-- Extensions + core domain schemas. Full migrations live per-service (Alembic/Flyway).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
-- pgvector is optional locally; enable when the image includes it
-- CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS tenancy;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS offers;
CREATE SCHEMA IF NOT EXISTS analytics;

-- ===================== TENANCY & AUTH =====================
CREATE TABLE IF NOT EXISTS tenancy.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    petpooja_restaurant_id TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenancy.staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    auth0_sub TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS tenancy.discount_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenancy.tenants(id),
    min_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    max_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    max_discount_rupees NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    food_cost_pct_of_gross NUMERIC(5, 2) NOT NULL DEFAULT 35.00,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================== CUSTOMER IDENTITY =====================
CREATE TABLE IF NOT EXISTS identity.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    phone_number TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    consent_whatsapp BOOLEAN DEFAULT false,
    UNIQUE (tenant_id, phone_number)
);

CREATE TABLE IF NOT EXISTS commerce.aggregator_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    petpooja_order_id TEXT NOT NULL,
    aggregator TEXT CHECK (aggregator IN ('zomato', 'swiggy', 'direct', 'ondc')),
    masked_customer_ref TEXT,
    customer_id UUID REFERENCES identity.customers(id),
    order_items JSONB NOT NULL,
    gross_amount NUMERIC(10, 2),
    food_cost NUMERIC(10, 2),
    ordered_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, petpooja_order_id)
);

CREATE INDEX IF NOT EXISTS idx_agg_orders_tenant_time
    ON commerce.aggregator_orders (tenant_id, ordered_at);

CREATE TABLE IF NOT EXISTS identity.identity_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregator_order_id UUID REFERENCES commerce.aggregator_orders(id),
    customer_id UUID REFERENCES identity.customers(id),
    otp_verified_at TIMESTAMPTZ,
    cashback_amount NUMERIC(10, 2),
    upi_txn_ref TEXT,
    payout_status TEXT CHECK (
        payout_status IS NULL
        OR payout_status IN ('pending', 'processing', 'paid', 'failed')
    ),
    upi_vpa TEXT,
    payout_idempotency_key TEXT,
    payout_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_claims_payout_idempotency
    ON identity.identity_claims (payout_idempotency_key)
    WHERE payout_idempotency_key IS NOT NULL;

-- ===================== HABIT / DECAY MODEL =====================
CREATE TABLE IF NOT EXISTS offers.customer_habit_profiles (
    customer_id UUID PRIMARY KEY REFERENCES identity.customers(id),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    predicted_dow SMALLINT,
    predicted_hour SMALLINT,
    top_items JSONB,
    avg_order_value NUMERIC(10, 2),
    decay_score NUMERIC(4, 3),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================== OFFERS & DISPATCH =====================
CREATE TABLE IF NOT EXISTS offers.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    customer_id UUID REFERENCES identity.customers(id),
    max_margin_safe_discount_pct NUMERIC(5, 2),
    max_discount_rupees NUMERIC(10, 2),
    favorite_dish_name TEXT,
    source_aggregator_order_id UUID REFERENCES commerce.aggregator_orders(id),
    generated_copy TEXT,
    llm_model_used TEXT,
    status TEXT CHECK (status IN ('pending', 'sent', 'clicked', 'converted', 'expired')),
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_source_order
    ON offers.offers (source_aggregator_order_id);

CREATE TABLE IF NOT EXISTS offers.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID REFERENCES offers.offers(id),
    wa_message_id TEXT,
    delivery_channel TEXT CHECK (delivery_channel IN ('meta_cloud_api', 'gupshup_bsp'))
        DEFAULT 'meta_cloud_api',
    status TEXT CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_offer_id
    ON offers.whatsapp_messages (offer_id);

CREATE TABLE IF NOT EXISTS commerce.direct_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenancy.tenants(id),
    customer_id UUID REFERENCES identity.customers(id),
    offer_id UUID REFERENCES offers.offers(id),
    channel TEXT CHECK (channel IN ('direct_link', 'ondc')),
    amount NUMERIC(10, 2),
    commission_saved NUMERIC(10, 2),
    ordered_at TIMESTAMPTZ DEFAULT now()
);

-- ===================== TIMESERIES =====================
CREATE TABLE IF NOT EXISTS analytics.order_events (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL,
    customer_id UUID,
    event_type TEXT,
    payload JSONB
);

SELECT create_hypertable('analytics.order_events', 'time', if_not_exists => TRUE);

-- ===================== LOCAL SEED =====================
INSERT INTO tenancy.tenants (id, name, petpooja_restaurant_id, plan)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Demo Kitchen',
    'pp_out_88219',
    'starter'
)
ON CONFLICT (petpooja_restaurant_id) DO NOTHING;

INSERT INTO tenancy.discount_policies (tenant_id)
VALUES ('11111111-1111-1111-1111-111111111111')
ON CONFLICT (tenant_id) DO NOTHING;
