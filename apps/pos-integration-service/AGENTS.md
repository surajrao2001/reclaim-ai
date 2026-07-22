# POS Integration Service

Petpooja webhook ingestion, order persistence, Kafka `order.created` publish, sticker print payload.

## Run

```bash
# from repo root
npm run build --workspace=@reclaimai/shared-types
npm run docker:up
cp .env.example .env   # ensure PETPOOJA_WEBHOOK_SECRET is set

npm run dev --workspace=@reclaimai/pos-integration-service
# listens on :3002
```

## Test

```bash
# unit (always)
npm test --workspace=@reclaimai/pos-integration-service

# integration (requires docker-compose postgres/redis/redpanda)
$env:RUN_INTEGRATION=1
npm run test:integration --workspace=@reclaimai/pos-integration-service
```

## Env

| Var | Purpose |
|---|---|
| `PORT` | Default `3002` |
| `DATABASE_URL` | `postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:19092` |
| `PETPOOJA_WEBHOOK_SECRET` | HMAC secret |
| `CLAIM_WEB_BASE_URL` | QR base URL |
| `DEFAULT_CASHBACK_AMOUNT_INR` | Sticker cashback amount |

## Endpoint

`POST /v1/webhooks/petpooja/order`  
Header: `X-Petpooja-HMAC-Signature` (hex HMAC-SHA256 of raw body)
