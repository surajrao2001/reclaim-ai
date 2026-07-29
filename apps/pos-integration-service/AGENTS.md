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

`POST /v1/demo/simulate-order`  
Public demo entry: builds a Petpooja-shaped payload for showcase `restID` (`pp_out_88219`), signs with `PETPOOJA_WEBHOOK_SECRET`, and invokes the same webhook service. Rate limited (demo default 3 / IP / 10 min via Redis; local default 5). Optional body `{ turnstile_token }` — verified when `TURNSTILE_SECRET_KEY` is set. Returns `{ order_id, claim_url, qr_code_url, ... }`.

No Swagger/OpenAPI UI is mounted on this Nest service.

| Extra env | Purpose |
|---|---|
| `DEMO_SIMULATE_RATE_LIMIT_MAX` / `_WINDOW_SECONDS` | Simulate Order Redis limit |
| `TURNSTILE_SECRET_KEY` | Optional Cloudflare Turnstile siteverify |
| `CORS_ORIGINS` | Browser origins (demo: `PUBLIC_BASE_URL` only, never `*`) |
