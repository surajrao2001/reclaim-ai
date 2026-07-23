# Plan: WhatsApp Dispatch

**Branch:** `feature/whatsapp-dispatch`  
**Status:** implemented  
**Depends on:** Copy LLM on `dev` (`reclaimai.message.generated.v1`)  
**Primary ownership:** `apps/whatsapp-dispatch-service/**`

## Goal

Consume `reclaimai.message.generated.v1` → resolve customer phone from offer → send WhatsApp via **Meta Cloud API (primary)** with **Gupshup BSP failover** → persist `offers.whatsapp_messages` → publish `reclaimai.whatsapp.delivered.v1`. Accept Meta delivery webhooks to advance status (`sent` → `delivered` → `read` / `failed`).

## Ownership

| Path | Owner |
|---|---|
| `apps/whatsapp-dispatch-service/**` | This milestone |
| `libs/kafka-contracts/schemas/whatsapp-delivered.v1.json` | W0 only (confirm; no breaking changes) |
| `libs/shared-types/**` | W0 only if types drift |
| `.env.example` / `AGENTS.md` | Env + port docs |
| `infra/k8s/init-db.sql` | Confirm `offers.whatsapp_messages` only |

## Context already in repo

- Scaffold: NestJS health on `:3003` (`apps/whatsapp-dispatch-service`)
- Contracts: `message-generated.v1.json`, `whatsapp-delivered.v1.json`, topics in `topics.yml`
- Types: `MessageGeneratedPayload`, `WhatsappDeliveredPayload`, `TOPICS.WHATSAPP_DELIVERED`
- Table: `offers.whatsapp_messages` (`wa_message_id`, `delivery_channel`, `status`)
- Env placeholders: `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `GUPSHUP_API_KEY`
- Upstream: copy publishes `message.generated` with `offer_id` + `message_body` (+ optional `cta_url`); phone is **not** on the event — load via `offers.offers` → `identity.customers`

## Design decisions (Phase 0)

| Decision | Choice | Why |
|---|---|---|
| Stack | NestJS (mirror POS modules: config, db, redis, kafka) | Blueprint + existing Nest patterns |
| Send timing | **Send immediately** on `message.generated` | Habit scheduling lives on offer `scheduled_for`; defer delayed dispatch / SQS to a later milestone |
| Message type | Env `WHATSAPP_SEND_MODE=text\|template` (default **`text`**) | Meta test numbers accept free-form text; production marketing needs approved templates + body params |
| Failover | Meta first; on timeout / 5xx / circuit-open → Gupshup once | Blueprint meal-window resilience; no silent drop |
| Idempotency | Redis key `wa:dispatch:{offer_id}` + unique row per offer (see migrate) | Kafka redelivery must not double-send |
| Phone | E.164 from `identity.customers.phone_number` for offer’s `customer_id` | Required for both Meta and Gupshup |
| Consent | Skip send if `consent_whatsapp=false`; mark `failed` + do not publish success | DPDP / claim opt-in |
| Delivery receipts | Meta webhook `GET` verify + `POST` statuses | Update row + republish `whatsapp.delivered` with new `status` |
| Mock mode | `WHATSAPP_MOCK=true` skips external HTTP; fake `wa_message_id` | CI / no-keys local path; real keys preferred when present |

### Meta Cloud API (primary)

- `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`
- Auth: `Authorization: Bearer {META_WA_TOKEN}`
- Text mode body: `{ messaging_product, to, type: "text", text: { body } }`
- Template mode (when configured): approved template name + language + components; map `message_body` / discount / CTA into params — exact template name via env (`META_WA_TEMPLATE_NAME`, `META_WA_TEMPLATE_LANG`)

### Gupshup (failover)

- REST send with `GUPSHUP_API_KEY` (+ `GUPSHUP_APP_NAME` / source number from env)
- Same `message_body` payload; record `delivery_channel=gupshup_bsp`
- Exact Gupshup endpoint/shape documented in service AGENTS.md once implemented against their current API

### Kafka out

Envelope + payload:

```json
{
  "offer_id": "uuid",
  "wa_message_id": "wamid....",
  "delivery_channel": "meta_cloud_api",
  "status": "sent"
}
```

Statuses: `queued` | `sent` | `delivered` | `read` | `failed` (schema enum).

Initial publish after accepted send → `sent` (or `failed`). Webhook updates → `delivered` / `read` / `failed`.

## Worker steps

- [x] **W0** Confirm `whatsapp-delivered` + `message-generated` contracts and shared-types; add unique index on `offers.whatsapp_messages(offer_id)` if missing (`scripts/migrate-whatsapp.sql`); document env vars in `.env.example`
- [x] **W1** Nest modules: config, Postgres, Redis, Kafka consumer (`message.generated`) + producer (`whatsapp.delivered`); resolve offer + customer phone; idempotent dispatch orchestrator
- [x] **W2** Meta client + Gupshup client + circuit/failover; persist `whatsapp_messages`; update `offers.offers.status` → `sent` on success; Meta webhook verify + status callback
- [x] **W3** Unit tests (failover, idempotency, consent skip, mock send); integration (`RUN_INTEGRATION=1`) with Redpanda + Postgres + mock HTTP or live test numbers
- [x] **W4** `AGENTS.md` for service + root tracker; health remains on `:3003`

## Acceptance criteria

1. Valid `message.generated` → one Meta (or mock) send attempt → row in `offers.whatsapp_messages` with `wa_message_id` and `delivery_channel`
2. Kafka `reclaimai.whatsapp.delivered.v1` matches envelope + payload schemas (`status=sent` on accept)
3. Meta 5xx / timeout → single Gupshup attempt; channel recorded as `gupshup_bsp` when that path wins
4. Duplicate Kafka event for same `offer_id` → no second provider send; same logical outcome
5. `consent_whatsapp=false` → no provider call; no success delivery event
6. Meta webhook status update advances row `status` and republishes delivery event
7. Missing Meta/Gupshup config with `WHATSAPP_MOCK=false` → clear startup or send error (standard error envelope on HTTP paths)
8. Unit tests pass; integration passes with docker up when `RUN_INTEGRATION=1`

## Out of scope

- Delayed send / habit-window scheduler / SQS
- Multi-tenant WABA credential vault (single shared Meta + Gupshup credentials for Phase 0)
- Template approval workflow UI
- Media / interactive buttons beyond text or simple template params
- Cashback / RazorpayX, Auth0, Terraform/EKS
- Changing upstream copy/margin contracts

## Local setup

```powershell
# Keys in root .env (never commit)
META_WA_TOKEN=...
META_WA_PHONE_NUMBER_ID=...
GUPSHUP_API_KEY=...
# Optional
WHATSAPP_MOCK=false
WHATSAPP_SEND_MODE=text
META_WA_TEMPLATE_NAME=
META_WA_TEMPLATE_LANG=en

Get-Content scripts/migrate-whatsapp.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai
npm run dev --workspace=@reclaimai/whatsapp-dispatch-service
```

Expose Meta webhook locally via ngrok (or similar) → `POST/GET http://localhost:3003/v1/webhooks/meta-whatsapp`.

## Notes

- Mirror POS Nest layout (`modules/config`, `database`, `redis`, `kafka`) for consistency.
- Do not log full phone numbers or access tokens; mask in logs.
- Rate-tier graduation / full Meta messaging-tier backoff is deferred; basic retry + failover is enough for Phase 0.
