-- One-shot migration for existing local Postgres volumes.
-- Usage: Get-Content scripts/migrate-cashback.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

ALTER TABLE identity.identity_claims
  ADD COLUMN IF NOT EXISTS payout_status TEXT;

ALTER TABLE identity.identity_claims
  ADD COLUMN IF NOT EXISTS upi_vpa TEXT;

ALTER TABLE identity.identity_claims
  ADD COLUMN IF NOT EXISTS payout_idempotency_key TEXT;

ALTER TABLE identity.identity_claims
  ADD COLUMN IF NOT EXISTS payout_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'identity_claims_payout_status_check'
  ) THEN
    ALTER TABLE identity.identity_claims
      ADD CONSTRAINT identity_claims_payout_status_check
      CHECK (
        payout_status IS NULL
        OR payout_status IN ('pending', 'processing', 'paid', 'failed')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_claims_payout_idempotency
  ON identity.identity_claims (payout_idempotency_key)
  WHERE payout_idempotency_key IS NOT NULL;
