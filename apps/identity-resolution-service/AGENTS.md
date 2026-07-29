# Identity Resolution Service

B2C claim flow: QR token → phone + email → OTP (email via Resend / SMTP local) → customer profile merge → Kafka `identity.unmasked` → UPI cashback via RazorpayX.

## Portfolio demo (RazorpayX test mode)

Hosted demo runs with **`RAZORPAYX_MOCK=false`** and RazorpayX **test-mode** credentials (real HTTP + webhooks; **no live money**). Compose forces `RAZORPAYX_MOCK=false`.

### RazorpayX test setup

1. Create a RazorpayX account and use the **Test Mode** API keys (Dashboard → API Keys while Test Mode is on).
2. Copy **Key Id** → `RAZORPAYX_KEY_ID`, **Key Secret** → `RAZORPAYX_KEY_SECRET`.
3. Create / note a Test Mode current-account number → `RAZORPAYX_ACCOUNT_NUMBER`.
4. Register a payout webhook:
   - **URL:** `{PUBLIC_BASE_URL}/api/identity/v1/webhooks/razorpayx/payout`  
     Example (local Caddy demo): `http://localhost:8088/api/identity/v1/webhooks/razorpayx/payout`  
     Example (hosted): `https://your-demo-domain/api/identity/v1/webhooks/razorpayx/payout`
   - **Secret:** same value as `RAZORPAYX_WEBHOOK_SECRET`
   - Subscribe to payout status events (`payout.processed`, `payout.failed`, etc.)
5. Caddy strips `/api/identity` and proxies to this service on `:8001`, so FastAPI routes stay `/v1/webhooks/razorpayx/payout`.

Service refuses to start with `RAZORPAYX_MOCK=false` unless key id, secret, account number, and webhook secret are set. Local/dev may keep mock on (or unset with empty key id) without RazorpayX credentials.

Claim-web labels this path as a **test payout (no real money)** for portfolio honesty.

### Env (demo)

| Var | Demo value |
|---|---|
| `RAZORPAYX_MOCK` | `false` (compose forces this) |
| `RAZORPAYX_KEY_ID` / `RAZORPAYX_KEY_SECRET` | **Required** — RazorpayX **test** keys |
| `RAZORPAYX_ACCOUNT_NUMBER` | **Required** — test debit account |
| `RAZORPAYX_WEBHOOK_SECRET` | Must match RazorpayX webhook secret |

## Run

```bash
# from repo root
npm run docker:up
cp .env.example .env

cd apps/identity-resolution-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
```

Apply cashback columns if the Postgres volume predates this milestone:

```powershell
Get-Content scripts/migrate-cashback.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai
```

## Test

```bash
pytest tests/test_claim_unit.py tests/test_cashback_unit.py tests/test_otp_delivery_unit.py tests/test_otp_rate_limit_unit.py tests/test_openapi_docs_unit.py

$env:RUN_INTEGRATION="1"
pytest tests/test_claim_integration.py
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/claim/context/{token}` | Resolve order from QR token |
| POST | `/v1/claim/otp/request` | Send OTP (`phone_e164` + `email`) via configured provider |
| POST | `/v1/claim/otp/verify` | Verify OTP (phone + otp), merge profile, publish event, return claim JWT |
| POST | `/v1/claim/cashback` | Bearer claim JWT + UPI VPA → RazorpayX payout (Redis rate limit per claim + IP) |
| POST | `/v1/webhooks/razorpayx/payout` | Payout status updates (`X-Razorpay-Signature`) |

OpenAPI `/docs` is disabled when `ENVIRONMENT=production` or `DEMO_HARDENED=true`.

### Rate limits (Redis)

| Endpoint | Default | Key |
|---|---|---|
| OTP request | 3 / phone / 10 min | `otp:ratelimit:{phone}` |
| Cashback | 5 / claim / 10 min and 10 / IP / 10 min | `cashback:ratelimit:claim|ip:…` |

429 responses use the standard `{ error: { code, message, trace_id, retryable } }` envelope (`OTP_RATE_LIMITED`, `CASHBACK_RATE_LIMITED`).

### OTP request body

```json
{
  "claim_token": "...",
  "phone_e164": "+919900000000",
  "email": "visitor@example.com"
}
```

Phone remains the identity / WhatsApp consent key. Email is the OTP delivery address for M3 (Resend). Verify still uses `phone_e164` + `otp`.

## OTP providers

Selected by `OTP_PROVIDER`:

| Value | Behavior |
|---|---|
| `smtp` (default local) | Mailhog / SMTP — soft-fails if down in development |
| `email` / `resend` | Resend HTTP API — **default for hosted demo** |
| `console` | No network; for unit tests |
| `whatsapp` | Meta Cloud API from identity (HTTP). Prefer `META_WA_OTP_TEMPLATE_NAME` with body `{{1}}`=OTP; without it, text-only (24h session). Reuses `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID`. |

In `ENVIRONMENT=production` (demo), Resend must be configured (`RESEND_API_KEY`, `OTP_FROM_EMAIL`) or OTP request returns `OTP_DELIVERY_FAILED`. Full OTP codes are never logged in production; local/dev may still use Redis `peek_otp` for integration tests.

## Env

See root `.env.example`. OTP / cashback-specific:

| Var | Purpose |
|---|---|
| `OTP_PROVIDER` | `smtp` \| `resend` \| `email` \| `console` \| `whatsapp` |
| `RESEND_API_KEY` | Resend API key (demo/prod) |
| `OTP_FROM_EMAIL` | From address / display name for Resend |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Local Mailhog path when `OTP_PROVIDER=smtp` |
| `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID` | Required when `OTP_PROVIDER=whatsapp` |
| `META_WA_OTP_TEMPLATE_NAME` / `META_WA_OTP_TEMPLATE_LANG` | Preferred cold OTP template (`{{1}}`=code) |
| `META_WA_API_VERSION` | Default `v21.0` |
| `RAZORPAYX_KEY_ID` / `RAZORPAYX_KEY_SECRET` | API auth (test keys for portfolio) |
| `RAZORPAYX_ACCOUNT_NUMBER` | Debit account |
| `RAZORPAYX_WEBHOOK_SECRET` | Webhook HMAC |
| `RAZORPAYX_MOCK` | Explicit `true`/`false`. If unset, mock when key id empty. Live/test (`false`) **requires** keys + account + webhook secret |
| `RAZORPAYX_BASE_URL` | Default `https://api.razorpay.com/v1` |

## RazorpayX send shape (real / test mode)

1. `POST /contacts` — create contact (`reference_id` = claim id)
2. `POST /fund_accounts` — VPA fund account
3. `POST /payouts` — UPI payout with `X-Payout-Idempotency: claim:{claim_id}`
