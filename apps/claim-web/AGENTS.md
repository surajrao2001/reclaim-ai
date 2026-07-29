# Claim Web

Guest-facing Next.js app (:3101). Landing + claim QR flow (`/c/[token]`).

## Run

```bash
npm run build --workspace=@reclaimai/shared-types
npm run dev --workspace=@reclaimai/claim-web
# http://localhost:3101
```

## Demo UX (M8)

- **Try live demo** calls `POST …/v1/demo/simulate-order`, then shows a short “what happens next” timeline before redirecting to the claim URL.
- Landing includes a compact pipeline diagram (order → claim → OTP → offer → WhatsApp → cashback).
- Public **`/status`** aggregates upstream health via demo proxy paths (`/api/pos/health`, `/api/identity/health`, `/api/margin/health`, `/api/copy/health`, `/api/whatsapp/health`, `/api/tenant-auth/health`). Behind Caddy these resolve to the services; direct local `:3101` falls back to localhost ports when env bases are unset.

## Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_POS_API_URL` | Default `http://localhost:3002` (demo: `/api/pos`) |
| `NEXT_PUBLIC_IDENTITY_API_URL` | Default `http://localhost:8001` (demo: `/api/identity`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional Turnstile widget on Simulate Order |
