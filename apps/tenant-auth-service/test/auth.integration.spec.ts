import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { signDevStaffToken } from '@reclaimai/shared-auth';
import { APP_CONFIG, loadConfig } from '../src/config/configuration';
import { DatabaseService } from '../src/modules/database/database.service';
import { StaffAuthGuard } from '../src/modules/auth/staff-auth.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { TenantsController } from '../src/modules/tenants/tenants.controller';

const shouldRun = process.env.RUN_INTEGRATION === '1';
const DEMO_TENANT = '11111111-1111-1111-1111-111111111111';

(shouldRun ? describe : describe.skip)('tenant-auth integration', () => {
  let database: DatabaseService;
  let authController: AuthController;
  let tenantsController: TenantsController;
  let guard: StaffAuthGuard;

  beforeAll(async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_SECRET = 'dev_dashboard_auth_secret_change_me';

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: APP_CONFIG, useFactory: loadConfig },
        DatabaseService,
        StaffAuthGuard,
        AuthController,
        TenantsController,
      ],
    }).compile();

    database = moduleRef.get(DatabaseService);
    authController = moduleRef.get(AuthController);
    tenantsController = moduleRef.get(TenantsController);
    guard = moduleRef.get(StaffAuthGuard);

    await database.query(`
      INSERT INTO tenancy.staff_users (id, tenant_id, email, role, auth0_sub)
      VALUES (
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'owner@demo.reclaimai.local',
        'owner',
        'dev|demo-owner'
      )
      ON CONFLICT (tenant_id, email) DO UPDATE
      SET auth0_sub = EXCLUDED.auth0_sub
    `);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
  });

  it('issues dev token, resolves /me, returns summary, forbids other tenant', async () => {
    const issued = await authController.issueDevToken();
    expect(issued.access_token).toBeTruthy();

    const req: any = {
      headers: { authorization: `Bearer ${issued.access_token}` },
    };
    await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => req }),
    } as any);

    const me = authController.me(req);
    expect(me.tenant_id).toBe(DEMO_TENANT);
    expect(me.role).toBe('owner');

    const summary = await tenantsController.getSummary(DEMO_TENANT, '7', req);
    expect(summary.tenant_id).toBe(DEMO_TENANT);
    expect(summary.window_days).toBe(7);
    expect(typeof summary.orders_count).toBe('number');

    await expect(
      tenantsController.getSummary('33333333-3333-3333-3333-333333333333', '7', req),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects unauthenticated summary access', async () => {
    const req: any = { headers: {} };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects unknown staff token', async () => {
    const token = await signDevStaffToken({
      secret: process.env.AUTH_DEV_SECRET!,
      sub: 'dev|unknown',
      email: 'nobody@example.com',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    try {
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as any);
      fail('expected guard to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
    }
  });
});
