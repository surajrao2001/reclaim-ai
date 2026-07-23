# Margin Offer Engine

Deterministic margin-safe discount ceilings. Consumes `identity.unmasked`, publishes `offer.ready`.

## Run

```bash
# from repo root
npm run docker:up
# existing DB volumes need one-shot migration:
Get-Content scripts/migrate-margin.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

cd apps/margin-offer-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8002
```

## Test

```bash
pytest tests/test_margin_unit.py

$env:RUN_INTEGRATION="1"
pytest tests/test_margin_integration.py
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/tenants/{tenant_id}/settings/discount-policy` | Read policy (creates defaults) |
| PUT | `/v1/tenants/{tenant_id}/settings/discount-policy` | Update policy (dev-open, no Auth0) |

## Kafka

- Consumes: `reclaimai.identity.unmasked.v1`
- Publishes: `reclaimai.offer.ready.v1`

## Env

`DATABASE_URL` (port **5433**), `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_ENABLED` (default true).
