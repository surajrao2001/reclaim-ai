-- One-shot migration for existing local Postgres volumes (init-db.sql already applied).
-- Usage: Get-Content scripts/migrate-whatsapp.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

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
