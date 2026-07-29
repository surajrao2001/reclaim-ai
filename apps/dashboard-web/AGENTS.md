# Dashboard Web

Owner-facing Next.js app (:3100). Uses **Auth0 Universal Login** (SPA / Authorization Code + PKCE via `@auth0/auth0-spa-js`). After login the Auth0 access token is sent as `Bearer` to tenant-auth.

Local-only: when `NEXT_PUBLIC_AUTH_DEV_BYPASS=true` and Auth0 is unset, **Continue as Demo Owner** still works. Hosted/demo must set bypass `false`.

## Run

```bash
npm run build --workspace=@reclaimai/shared-types
npm run dev --workspace=@reclaimai/tenant-auth-service
npm run dev --workspace=@reclaimai/dashboard-web
# local bypass: http://localhost:3100 → Continue as Demo Owner
# Auth0: set NEXT_PUBLIC_AUTH0_* then Sign in with Auth0
```

## Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_TENANT_AUTH_URL` | Default `http://localhost:3001` (demo: `/api/tenant-auth`) |
| `NEXT_PUBLIC_AUTH_DEV_BYPASS` | Show demo login button (local default true; demo must be false) |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | Auth0 tenant domain (e.g. `your-tenant.auth0.com`) |
| `NEXT_PUBLIC_AUTH0_CLIENT_ID` | SPA application client id |
| `NEXT_PUBLIC_AUTH0_AUDIENCE` | API audience (must match tenant-auth `AUTH0_AUDIENCE`) |
| `NEXT_PUBLIC_AUTH0_CALLBACK_URL` | Allowed callback (local `http://localhost:3100`; demo `https://<host>/dashboard`) |
| `NEXT_PUBLIC_BASE_PATH` | Demo compose sets `/dashboard` |

## Auth0 application settings

Create a **Single Page Application** in Auth0:

1. **Allowed Callback URLs**
   - Local: `http://localhost:3100`
   - Demo: `https://<your-demo-host>/dashboard` (and `http://localhost:8088/dashboard` for local compose)
2. **Allowed Logout URLs** — same origins as callbacks
3. **Allowed Web Origins** — same origins (no path)
4. **APIs** — authorize the SPA against an Auth0 API whose **Identifier** equals `AUTH0_AUDIENCE` / `NEXT_PUBLIC_AUTH0_AUDIENCE`
5. Enable **Refresh Token Rotation** (SDK uses `useRefreshTokens`)
6. **Access token email (for first-login link):** add an Auth0 Post-Login Action that copies the user email onto the access token (custom claim `{audience}/email` or standard `email`). tenant-auth already reads both. Pre-seeding `staff_users.auth0_sub` to the Auth0 user `sub` skips this requirement.

Shared demo user: create one Auth0 user (email should match `AUTH0_DEMO_USER_EMAIL`, default `owner@demo.reclaimai.local`). Set `tenancy.staff_users.auth0_sub` to that user's `sub`, or keep the seed `dev|demo-owner` placeholder and let the first login with matching email link/replace it.

## Live KPI refresh (M8)

While the owner is signed in on the KPI view, the dashboard polls `GET …/dashboard/summary` about every **10s**. It reuses the stored bearer token and Auth0 `getTokenSilently` (cached; refresh only when near expiry) — it does not re-run Universal Login. KPI numbers update in place with a subtle **Updated … ago** footnote; the layout does not remount.
