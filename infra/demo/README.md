# Portfolio demo edge (HTTPS)

The demo stack exposes a single HTTP listener via Caddy on container port `:80`
(host `DEMO_HTTP_PORT`, default `8088`). For public internet traffic, put a free
HTTPS edge in front — do **not** open Postgres/Redis/Redpanda/Kafka ports.

## Preferred: Cloudflare Tunnel (free)

Cloudflare Tunnel terminates TLS at Cloudflare and forwards to the VM’s local
Caddy port. No inbound firewall holes required (fits Oracle Always Free).

1. Create a Tunnel in the Cloudflare Zero Trust dashboard.
2. Install `cloudflared` on the VM and run the tunnel toward local Caddy, e.g.
   `http://127.0.0.1:8088` (or whatever `DEMO_HTTP_PORT` you mapped).
3. Attach a hostname (e.g. `demo.example.com`) to that tunnel.
4. Set in `.env.demo` (never commit real values):

```bash
PUBLIC_BASE_URL=https://demo.example.com
CORS_ORIGINS=https://demo.example.com
NEXT_PUBLIC_AUTH0_CALLBACK_URL=https://demo.example.com/dashboard
```

5. Update Auth0 application Allowed Callback / Logout / Web Origins to the same
   HTTPS origin (see `apps/dashboard-web/AGENTS.md`).
6. Register provider webhooks against `PUBLIC_BASE_URL`:
   - Meta: `{PUBLIC_BASE_URL}/api/whatsapp/v1/webhooks/meta-whatsapp`
   - RazorpayX: `{PUBLIC_BASE_URL}/api/identity/v1/webhooks/razorpayx/payout`

Caddy stays on plain `:80` inside Docker; the tunnel is the public HTTPS edge.

## Alternative: Caddy HTTPS (Let’s Encrypt)

If you prefer opening ports 80/443 on the VM:

1. Point DNS A/AAAA at the VM.
2. Replace or extend `infra/demo/Caddyfile` with a site block for your domain
   (enable `auto_https`) and publish `80` + `443`.
3. Set `PUBLIC_BASE_URL=https://your.domain` the same way as above.

The checked-in Caddyfile keeps `auto_https off` because Tunnel (or another TLS
terminator) is the default free path.

## Hardening checklist (M7)

| Control | Notes |
|---|---|
| CORS | `CORS_ORIGINS` = public HTTPS origin only (no `*`) |
| OpenAPI | FastAPI `/docs` off when `ENVIRONMENT=production` (demo compose default) |
| Rate limits | Simulate, OTP request, cashback (Redis) |
| Turnstile | Optional on Simulate Order when `TURNSTILE_SECRET_KEY` is set |
| Secrets | `.env.demo` gitignored; use placeholders from `.env.demo.example` |
