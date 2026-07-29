# WhatsApp Dispatch Service

Consumes `reclaimai.message.generated.v1`, sends WhatsApp via **Meta Cloud API** (primary) with optional **Gupshup BSP** failover, persists `offers.whatsapp_messages`, publishes `reclaimai.whatsapp.delivered.v1`. Meta delivery webhooks update status.

## Portfolio demo (live Meta)

Hosted demo runs with **`WHATSAPP_MOCK=false`** and real Meta Cloud API credentials. Gupshup is **not required** for the portfolio path (failover only runs when Gupshup env vars are fully set).

### Meta Business setup

1. Create a Meta Business account and a WhatsApp Business App (Cloud API).
2. Add a test/production phone number; copy **Phone number ID** → `META_WA_PHONE_NUMBER_ID`.
3. Generate a permanent System User access token (or temporary for sandbox) → `META_WA_TOKEN`.
4. In WhatsApp → Configuration → Webhook:
   - **Callback URL:** `{PUBLIC_BASE_URL}/api/whatsapp/v1/webhooks/meta-whatsapp`  
     Example (local Caddy demo): `http://localhost:8088/api/whatsapp/v1/webhooks/meta-whatsapp`  
     Example (hosted): `https://your-demo-domain/api/whatsapp/v1/webhooks/meta-whatsapp`
   - **Verify token:** same value as `META_WA_VERIFY_TOKEN`
   - Subscribe to **messages** (status updates: sent / delivered / read / failed)
5. Caddy strips `/api/whatsapp` and proxies to this service on `:3003`, so Nest routes stay `/v1/webhooks/meta-whatsapp`.

### Template approval (cold outbound)

Cold outreach outside the 24h customer-care window **requires an approved message template**. Demo compose sets `WHATSAPP_SEND_MODE=template`.

Create a marketing/utility template named to match `META_WA_TEMPLATE_NAME` (e.g. `reclaimai_offer`), language `META_WA_TEMPLATE_LANG` (default `en`).

**Body variables this service fills (in order):**

| Var | Source |
|---|---|
| `{{1}}` | Offer `message_body` (always) |
| `{{2}}` | `selected_discount_value` INR (when present on `message.generated`) |
| `{{3}}` | `cta_url` (when present) |

Example template body:

```text
{{1}} Save ₹{{2}}. Open: {{3}}
```

Approval can take hours to days — start Meta account + template work early. Until approved, live sends will fail with Meta API errors (service does not fall back to mock).

### Env (demo)

| Var | Demo value |
|---|---|
| `WHATSAPP_MOCK` | `false` (compose forces this) |
| `WHATSAPP_SEND_MODE` | `template` |
| `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID` | **Required** — service refuses to start live without them |
| `META_WA_TEMPLATE_NAME` | **Required** in template mode |
| `META_WA_VERIFY_TOKEN` | Must match Meta webhook verify token |
| Gupshup vars | Optional — leave empty for portfolio |

Local/dev may keep `WHATSAPP_MOCK=true` (or unset with empty token) without Meta credentials.

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
| `WHATSAPP_MOCK` | Explicit `true`/`false`. If unset, mock when `META_WA_TOKEN` empty. Live (`false`) **requires** Meta token + phone number ID |
| `WHATSAPP_SEND_MODE` | `text` or `template` (demo prefers `template`) |
| `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID` | Cloud API credentials |
| `META_WA_VERIFY_TOKEN` | Webhook verification |
| `META_WA_TEMPLATE_NAME` / `META_WA_TEMPLATE_LANG` | Template mode (required when live + template) |
| `GUPSHUP_API_KEY` / `GUPSHUP_APP_NAME` / `GUPSHUP_SOURCE_NUMBER` | Optional BSP failover |
| `GUPSHUP_API_URL` | Default `https://api.gupshup.io/wa/api/v1/msg` |

## Endpoints

- `GET /health`
- `GET /v1/webhooks/meta-whatsapp` — Meta verify (`hub.mode`, `hub.verify_token`, `hub.challenge`)
- `POST /v1/webhooks/meta-whatsapp` — delivery/read/failed status updates

Public reverse-proxy path (demo Caddy): `/api/whatsapp/v1/webhooks/meta-whatsapp`.

## Gupshup send shape (optional failover)

`POST` `application/x-www-form-urlencoded` with header `apikey`, fields: `channel=whatsapp`, `source`, `destination`, `message` (JSON text body), `src.name`.

Not used on the hosted portfolio demo unless all Gupshup env vars are set.
