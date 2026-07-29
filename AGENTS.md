# ReclaimAI — Agent guide

## Stack

- Monorepo: Turborepo + npm workspaces (Node), independent Python `pyproject.toml` apps
- NestJS: B2B / integration / WhatsApp / audit services
- FastAPI: identity, margin, decay, LLM, analytics
- Next.js: `dashboard-web`, `claim-web`
- Local infra: Postgres/Timescale, Redis, Redpanda (`docker-compose.dev.yml`)

## Commands

```bash
npm install
cp .env.example .env
npm run docker:up
npm run build --workspace=@reclaimai/shared-types
npm run build --workspace=@reclaimai/shared-auth
```

## Ports

| Service | Port |
|---|---|
| dashboard-web | 3100 |
| claim-web | 3101 |
| tenant-auth-service | 3001 |
| pos-integration-service | 3002 |
| whatsapp-dispatch-service | 3003 |
| notification-audit-service | 3004 |
| identity-resolution-service | 8001 |
| margin-offer-engine | 8002 |
| decay-prediction-service | 8003 |
| copy-llm-orchestrator | 8004 |
| analytics-service | 8005 |
| Postgres | 5433 (host) → 5432 (container) |
| Redis | 6379 |
| Redpanda Kafka | 19092 |

## Orchestration

- Plans: `docs/plans/`
- Tracker: `docs/plans/_tracker.md`
- ADRs: `docs/adr/`
- Kafka contracts: `libs/kafka-contracts/`

Workers must follow the active plan file and must not change shared contracts unless the plan assigns that step.

## Error envelope

```json
{
  "error": {
    "code": "CODE",
    "message": "human readable",
    "trace_id": "uuid",
    "retryable": false
  }
}
```

## Dashboard Auth0 (hosted demo)

- Hosted/demo: `AUTH_DEV_BYPASS=false`, `NEXT_PUBLIC_AUTH_DEV_BYPASS=false`, Auth0 SPA vars set (see `.env.demo.example`).
- Shared demo Auth0 user email should match `AUTH0_DEMO_USER_EMAIL` (default `owner@demo.reclaimai.local` on Demo Kitchen).
- Map `tenancy.staff_users.auth0_sub` to that Auth0 user's `sub`, or leave the seed `dev|demo-owner` placeholder and let first login link by email.
- Auth0 app callback / logout / web origins: see `apps/dashboard-web/AGENTS.md`.

## Portfolio demo hardening (M7)

- HTTPS edge: prefer Cloudflare Tunnel → Caddy `:80` — see `infra/demo/README.md`.
- Env template: `.env.demo.example` (`PUBLIC_BASE_URL=https://…`, locked `CORS_ORIGINS`, no `*`).
- FastAPI OpenAPI/`/docs` off when `ENVIRONMENT=production` or `DEMO_HARDENED=true`.
- Nest apps do not expose Swagger.
- Rate limits: Simulate Order, OTP request, cashback (claim + IP) via Redis; 429 uses the standard error envelope.
- Optional Turnstile on Simulate Order (`TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` build arg).

## Portfolio demo polish (M8)

- Dashboard KPIs auto-refresh ~every 10s while signed in (stored / silent Auth0 token; “Updated … ago”).
- Claim landing: post-simulate “what happens next” panel + pipeline diagram; public `/status` aggregates `/api/*/health` via Caddy.
