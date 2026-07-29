# Identity Resolution Service

B2C claim flow: QR token → phone + email → OTP (email via Resend / SMTP local) → customer profile merge → Kafka `identity.unmasked` → UPI cashback via RazorpayX.

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
pytest tests/test_claim_unit.py tests/test_cashback_unit.py tests/test_otp_delivery_unit.py

$env:RUN_INTEGRATION="1"
pytest tests/test_claim_integration.py
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/claim/context/{token}` | Resolve order from QR token |
| POST | `/v1/claim/otp/request` | Send OTP (`phone_e164` + `email`) via configured provider |
| POST | `/v1/claim/otp/verify` | Verify OTP (phone + otp), merge profile, publish event, return claim JWT |
| POST | `/v1/claim/cashback` | Bearer claim JWT + UPI VPA → RazorpayX payout |
| POST | `/v1/webhooks/razorpayx/payout` | Payout status updates (`X-Razorpay-Signature`) |

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
| `RAZORPAYX_KEY_ID` / `RAZORPAYX_KEY_SECRET` | API auth |
| `RAZORPAYX_ACCOUNT_NUMBER` | Debit account |
| `RAZORPAYX_WEBHOOK_SECRET` | Webhook HMAC |
| `RAZORPAYX_MOCK` | Defaults true when key id empty |
| `RAZORPAYX_BASE_URL` | Default `https://api.razorpay.com/v1` |

## RazorpayX send shape (real mode)

1. `POST /contacts` — create contact (`reference_id` = claim id)
2. `POST /fund_accounts` — VPA fund account
3. `POST /payouts` — UPI payout with `X-Payout-Idempotency: claim:{claim_id}`
