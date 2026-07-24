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
| POST | `/v1/auth/dev-token` | public when `AUTH_DEV_BYPASS` |
| GET | `/v1/me` | Bearer |
| GET | `/v1/tenants/:tenantId` | Bearer + same tenant |
| GET | `/v1/tenants/:tenantId/dashboard/summary` | Bearer + same tenant |

## Env

| Var | Purpose |
|---|---|
| `AUTH_DEV_BYPASS` | Default true when `AUTH0_DOMAIN` empty |
| `AUTH_DEV_SECRET` | HS256 secret for demo tokens |
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` / `AUTH0_JWKS_URL` | Real Auth0 |
| `DATABASE_URL` | Postgres |
| `CORS_ORIGINS` | Default `http://localhost:3100` |

Demo staff: `owner@demo.reclaimai.local` / `auth0_sub=dev|demo-owner` on Demo Kitchen.
