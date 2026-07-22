# Identity Resolution Service

B2C claim flow: QR token → OTP → customer profile merge → Kafka `identity.unmasked`.

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

## Test

```bash
# unit
pytest tests/test_claim_unit.py

# integration (docker postgres/redis/redpanda/mailhog)
$env:RUN_INTEGRATION="1"
pytest tests/test_claim_integration.py
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/claim/context/{token}` | Resolve order from QR token |
| POST | `/v1/claim/otp/request` | Send OTP (Mailhog locally) |
| POST | `/v1/claim/otp/verify` | Verify OTP, merge profile, publish event |

## Env

See root [.env.example](../../.env.example): `DATABASE_URL`, `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS`, `CLAIM_JWT_SECRET`, `PHONE_HASH_SECRET`, `SMTP_*`, `CORS_ORIGINS`.
