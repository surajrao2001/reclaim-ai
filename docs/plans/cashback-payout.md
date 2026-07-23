# Plan: Cashback Payout (RazorpayX)

**Branch:** `feature/cashback-payout`  
**Status:** implemented  
**Depends on:** Identity claim + OTP on `dev`  
**Primary ownership:** `apps/identity-resolution-service/**`, `apps/claim-web/**`

## Goal

After OTP verify, customer enters UPI VPA → `POST /v1/claim/cashback` (claim JWT) → **RazorpayX** UPI payout → persist payout state on `identity.identity_claims` → RazorpayX webhook confirms `paid` / `failed`. Replace “UPI payout coming soon” in claim UX.

## Ownership

| Path | Owner |
|---|---|
| `apps/identity-resolution-service/**` | Cashback API, RazorpayX client, webhook, DB |
| `apps/claim-web/**` | UPI step + call cashback API |
| `libs/shared-types/**` | W0 claim cashback request/response types |
| `.env.example` / service `AGENTS.md` | RazorpayX + mock env |
| `scripts/migrate-cashback.sql` + `infra/k8s/init-db.sql` | Payout columns on `identity_claims` |

## Context already in repo

- OTP verify creates `identity.identity_claims` with `cashback_amount`, empty `upi_txn_ref`
- Returns short-lived `claim_jwt` (`scope=cashback_claim`, TTL ~5 min) with `customer_id` + `claim_id`
- Claim messages still say “UPI payout coming soon”
- Env placeholders: `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`
- Blueprint: `POST /v1/claim/cashback`; payouts must be **pending first**, webhook-confirmed, idempotent (never fire-and-forget)

## Design decisions (Phase 0)

| Decision | Choice | Why |
|---|---|---|
| Service | Stay in **identity-resolution-service** | Blueprint endpoint lives under `/v1/claim/*`; claim JWT already issued here |
| Auth | `Authorization: Bearer <claim_jwt>` on cashback | Scoped to one claim; no B2C password store |
| UX | claim-web: after OTP → **UPI VPA step** → success with payout status | Closes the sticker promise |
| Amount | `identity_claims.cashback_amount` (from `DEFAULT_CASHBACK_AMOUNT_INR`) | Already set at verify time |
| Provider | RazorpayX composite: contact → fund account (VPA) → payout | Standard India UPI payout path |
| Lifecycle | `pending` → `processing` → `paid` \| `failed` | Blueprint financial safeguards |
| Idempotency | Redis `cashback:payout:{claim_id}` + refuse second payout if status in (`pending`,`processing`,`paid`) | Double-submit / refresh safe |
| Mock | `RAZORPAYX_MOCK=true` (default when keys empty) | Local/CI without live RazorpayX |
| Kafka | **No new topic** in Phase 0 | DB + webhook is enough; analytics later |
| Nightly reconcile job | **Out of scope** | Document as follow-up; webhook is enough for MVP |

### Schema additions (`identity.identity_claims`)

```sql
ALTER TABLE identity.identity_claims
  ADD COLUMN IF NOT EXISTS payout_status TEXT
    CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS payout_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payout_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_claims_payout_idempotency
  ON identity.identity_claims (payout_idempotency_key)
  WHERE payout_idempotency_key IS NOT NULL;
```

Existing `upi_txn_ref` stores RazorpayX payout id once accepted.

### API

**`POST /v1/claim/cashback`**

Headers: `Authorization: Bearer <claim_jwt>`  
Body:

```json
{ "upi_vpa": "customer@upi" }
```

Success (202 / 200):

```json
{
  "claim_id": "uuid",
  "payout_status": "processing",
  "cashback_amount_inr": 100,
  "upi_txn_ref": "pout_xxx_or_mock",
  "message": "Cashback initiated to your UPI ID"
}
```

Errors (standard envelope): `CLAIM_JWT_INVALID`, `CLAIM_NOT_FOUND`, `PAYOUT_ALREADY_EXISTS`, `INVALID_UPI_VPA`, `PAYOUT_PROVIDER_ERROR` (retryable when appropriate).

**`POST /v1/webhooks/razorpayx/payout`**

- Verify RazorpayX webhook signature (`RAZORPAYX_WEBHOOK_SECRET`)
- Map payout id → claim via `upi_txn_ref`
- Advance `payout_status` to `paid` / `failed`
- Idempotent on duplicate webhook deliveries

### RazorpayX (real mode)

- Auth: Basic `KEY_ID:KEY_SECRET`
- Debit account: `RAZORPAYX_ACCOUNT_NUMBER`
- Payout purpose: `cashback` / `payout`
- Pass `payout_idempotency_key` = `claim:{claim_id}` (stable)
- Exact HTTP paths documented in service AGENTS.md against current RazorpayX docs during W2

### claim-web flow change

```
phone → OTP → (new) UPI VPA → success showing amount + status
```

- Keep `claim_jwt` in memory after verify (do not put in localStorage long-term)
- Call cashback API; show provider/mock errors with envelope message
- Already-claimed + already-paid → success copy without re-collecting VPA when possible (context may expose `payout_status` later; Phase 0 can re-prompt only if unpaid)

## Worker steps

- [x] **W0** Shared-types for cashback request/response; migrate script + init-db columns; env docs
- [x] **W1** Identity: verify claim JWT helper; cashback service (pending → provider → store ref); RazorpayX client + mock
- [x] **W2** `POST /v1/claim/cashback` + RazorpayX webhook; claim-web UPI step + API client
- [x] **W3** Unit tests (VPA validation, idempotency, JWT, mock payout, webhook status); integration with `RUN_INTEGRATION=1`
- [x] **W4** AGENTS.md + tracker + plan checklist

## Acceptance criteria

1. Valid claim JWT + VPA → row moves to `processing`/`paid` (mock) with `upi_txn_ref` set
2. Duplicate cashback for same claim → no second provider call; same logical response
3. Invalid/expired JWT → `401` envelope
4. Invalid VPA shape → `400` `INVALID_UPI_VPA`
5. Mock mode works with empty RazorpayX keys; real mode errors clearly when keys missing and mock off
6. Webhook (or mock simulate) advances status to `paid` / `failed`
7. claim-web no longer shows “coming soon”; UPI step completes happy path
8. Unit tests pass; integration passes with docker when `RUN_INTEGRATION=1`

## Out of scope

- Nightly payout reconciliation job
- Multi-tenant RazorpayX credential vault (single shared account for Phase 0)
- Permanent recognition cookie / skip-OTP on WhatsApp clicks
- Changing OTP / Kafka `identity.unmasked` contracts
- Auth0, dashboard, Terraform/EKS
- Partial refunds / clawbacks

## Local setup

```powershell
# Keys in root .env (never commit)
RAZORPAYX_KEY_ID=
RAZORPAYX_KEY_SECRET=
RAZORPAYX_ACCOUNT_NUMBER=
RAZORPAYX_WEBHOOK_SECRET=
# Optional — defaults true when KEY_ID empty
RAZORPAYX_MOCK=

Get-Content scripts/migrate-cashback.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai
# identity :8001 + claim-web :3101
```

Expose webhook locally via ngrok → `POST http://localhost:8001/v1/webhooks/razorpayx/payout`.

## Notes

- Do not log full UPI VPAs or Razorpay secrets; mask VPA (show last segment only).
- Claim JWT TTL is short (~5 min) — cashback must happen in the same session after OTP.
- Prefer httpx + existing FastAPI patterns in identity service.
