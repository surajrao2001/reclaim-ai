# Identity Resolution Service

B2C claim flow: QR token → OTP → customer profile merge → Kafka `identity.unmasked` → UPI cashback via RazorpayX.

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
pytest tests/test_claim_unit.py tests/test_cashback_unit.py

$env:RUN_INTEGRATION="1"
pytest tests/test_claim_integration.py
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/claim/context/{token}` | Resolve order from QR token |
| POST | `/v1/claim/otp/request` | Send OTP (Mailhog locally) |
| POST | `/v1/claim/otp/verify` | Verify OTP, merge profile, publish event, return claim JWT |
| POST | `/v1/claim/cashback` | Bearer claim JWT + UPI VPA → RazorpayX payout |
| POST | `/v1/webhooks/razorpayx/payout` | Payout status updates (`X-Razorpay-Signature`) |

## Env

See root `.env.example`. Cashback-specific:

| Var | Purpose |
|---|---|
| `RAZORPAYX_KEY_ID` / `RAZORPAYX_KEY_SECRET` | API auth |
| `RAZORPAYX_ACCOUNT_NUMBER` | Debit account |
| `RAZORPAYX_WEBHOOK_SECRET` | Webhook HMAC |
| `RAZORPAYX_MOCK` | Defaults true when key id empty |
| `RAZORPAYX_BASE_URL` | Default `https://api.razorpay.com/v1` |

## RazorpayX send shape (real mode)

1. `POST /contacts` — create contact (`reference_id` = claim id)
2. `POST /fund_accounts` — VPA fund account
3. `POST /payouts` — UPI payout with `X-Payout-Idempotency: claim:{claim_id}`
