-- Seed demo staff for dashboard Auth0 / dev bypass.
-- Usage: Get-Content scripts/migrate-dashboard-auth.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai

INSERT INTO tenancy.staff_users (id, tenant_id, email, role, auth0_sub)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'owner@demo.reclaimai.local',
    'owner',
    'dev|demo-owner'
)
ON CONFLICT (tenant_id, email) DO UPDATE
SET role = EXCLUDED.role,
    auth0_sub = COALESCE(tenancy.staff_users.auth0_sub, EXCLUDED.auth0_sub);
