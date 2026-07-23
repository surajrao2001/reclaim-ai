# WhatsApp Dispatch Service

Consumes `reclaimai.message.generated.v1`, sends WhatsApp via **Meta Cloud API** (primary) with **Gupshup BSP** failover, persists `offers.whatsapp_messages`, publishes `reclaimai.whatsapp.delivered.v1`. Meta delivery webhooks update status.

## Run

```bash
# from repo root
npm run build --workspace=@reclaimai/shared-types
npm run docker:up
# apply unique index if volume predates this milestone:
# Get-Content scripts/migrate-whatsapp.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

npm run dev --workspace=@reclaimai/whatsapp-dispatch-service
# listens on :3003
```

## Test

```bash
npm test --workspace=@reclaimai/whatsapp-dispatch-service

# integration (Postgres + Redis + Redpanda)
$env:RUN_INTEGRATION=1
npm run test:integration --workspace=@reclaimai/whatsapp-dispatch-service
```

## Env

| Var | Purpose |
|---|---|
| `PORT` | Default `3003` |
| `DATABASE_URL` | Postgres (host port `5433` locally) |
| `REDIS_URL` | Idempotency locks |
| `KAFKA_BOOTSTRAP_SERVERS` | Default `localhost:19092` |
| `KAFKA_GROUP_ID` | Default `whatsapp-dispatch-service` |
| `KAFKA_ENABLED` | Set `false` to skip consumer (tests) |
| `WHATSAPP_MOCK` | `true` skips Meta/Gupshup HTTP (default when `META_WA_TOKEN` empty) |
| `WHATSAPP_SEND_MODE` | `text` (default) or `template` |
| `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID` | Cloud API credentials |
| `META_WA_VERIFY_TOKEN` | Webhook verification |
| `META_WA_TEMPLATE_NAME` / `META_WA_TEMPLATE_LANG` | Template mode |
| `GUPSHUP_API_KEY` / `GUPSHUP_APP_NAME` / `GUPSHUP_SOURCE_NUMBER` | BSP failover |
| `GUPSHUP_API_URL` | Default `https://api.gupshup.io/wa/api/v1/msg` |

## Endpoints

- `GET /health`
- `GET /v1/webhooks/meta-whatsapp` — Meta verify (`hub.mode`, `hub.verify_token`, `hub.challenge`)
- `POST /v1/webhooks/meta-whatsapp` — delivery/read/failed status updates

## Gupshup send shape

`POST` `application/x-www-form-urlencoded` with header `apikey`, fields: `channel=whatsapp`, `source`, `destination`, `message` (JSON text body), `src.name`.
