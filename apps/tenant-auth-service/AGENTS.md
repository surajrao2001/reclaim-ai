# Tenant Auth Service

B2B staff auth (Auth0 JWKS or local dev bypass) and tenant dashboard summary.

## Run

```bash
npm run build --workspace=@reclaimai/shared-types
npm run build --workspace=@reclaimai/shared-auth
npm run docker:up
Get-Content scripts/migrate-dashboard-auth.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

npm run dev --workspace=@reclaimai/tenant-auth-service
# :3001
```

## Test

```bash
npm test --workspace=@reclaimai/tenant-auth-service

$env:RUN_INTEGRATION=1
npm run test:integration --workspace=@reclaimai/tenant-auth-service
```

## API

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |
| POST | `/v1/auth/dev-token` | public only when `AUTH_DEV_BYPASS=true` and not production |
| GET | `/v1/me` | Bearer |
| GET | `/v1/tenants/:tenantId` | Bearer + same tenant |
| GET | `/v1/tenants/:tenantId/dashboard/summary` | Bearer + same tenant |

## Env

| Var | Purpose |
|---|---|
| `AUTH_DEV_BYPASS` | Default true when `AUTH0_DOMAIN` empty; **forced false when `NODE_ENV=production`** |
| `AUTH_DEV_SECRET` | HS256 secret for demo tokens |
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` / `AUTH0_JWKS_URL` | Auth0 JWKS verification (required when bypass is off) |
| `AUTH0_DEMO_USER_EMAIL` | Shared demo staff email (default `owner@demo.reclaimai.local`) |
| `AUTH0_DEMO_USER_SUB` | Optional Auth0 `sub` used by `/v1/auth/dev-token` only; seed/map DB `auth0_sub` to the real Auth0 user |
| `DATABASE_URL` | Postgres |
| `CORS_ORIGINS` | Default `http://localhost:3100` |

## Auth0 mapping (Demo Kitchen)

Seed staff: `owner@demo.reclaimai.local` on Demo Kitchen (`scripts/migrate-dashboard-auth.sql` / `infra/k8s/init-db.sql`).

After Auth0 Universal Login, the dashboard sends the Auth0 **access token**. This service:

1. Verifies JWKS (`createOidcVerifier`) when `AUTH_DEV_BYPASS=false`
2. Looks up `staff_users` by `auth0_sub` (`sub` claim)
3. If missing, looks up by email and links `auth0_sub` (also replaces the local placeholder `dev|demo-owner`)

**Setup for shared demo user**

1. Create Auth0 SPA + API (audience = `AUTH0_AUDIENCE`)
2. Create one Auth0 user; note its `sub` (e.g. `auth0|…`)
3. Either `UPDATE tenancy.staff_users SET auth0_sub = '<sub>' WHERE email = 'owner@demo.reclaimai.local'`, **or** ensure the Auth0 user email equals `AUTH0_DEMO_USER_EMAIL` so first login auto-links
4. Callback URLs: see `apps/dashboard-web/AGENTS.md`

`POST /v1/auth/dev-token` is blocked when bypass is false or `NODE_ENV=production`.
