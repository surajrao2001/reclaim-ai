# Dashboard Web

Owner-facing Next.js app (:3100). Phase 0 uses **dev bypass** login against tenant-auth; Auth0 Universal Login can be wired when `AUTH0_*` is configured on the API.

## Run

```bash
npm run build --workspace=@reclaimai/shared-types
npm run dev --workspace=@reclaimai/tenant-auth-service
npm run dev --workspace=@reclaimai/dashboard-web
# open http://localhost:3100 → Continue as Demo Owner
```

## Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_TENANT_AUTH_URL` | Default `http://localhost:3001` |
| `NEXT_PUBLIC_AUTH_DEV_BYPASS` | Show demo login button (default true) |
