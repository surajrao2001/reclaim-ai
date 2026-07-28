import { HttpException } from '@nestjs/common';
import { StaffAuthGuard } from '../src/modules/auth/staff-auth.guard';
import type { AppConfig } from '../src/config/configuration';
import type { DatabaseService, StaffRow } from '../src/modules/database/database.service';

jest.mock('@reclaimai/shared-auth', () => ({
  createOidcVerifier: jest.fn(),
  verifyDevStaffToken: jest.fn(),
}));

import { createOidcVerifier, verifyDevStaffToken } from '@reclaimai/shared-auth';

const createOidcVerifierMock = createOidcVerifier as jest.MockedFunction<
  typeof createOidcVerifier
>;
const verifyDevStaffTokenMock = verifyDevStaffToken as jest.MockedFunction<
  typeof verifyDevStaffToken
>;

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    databaseUrl: 'postgresql://x',
    authDevBypass: false,
    authDevSecret: 'test-secret',
    auth0Domain: 'example.auth0.com',
    auth0Audience: 'https://api.reclaimai.demo',
    auth0JwksUrl: 'https://example.auth0.com/.well-known/jwks.json',
    auth0Issuer: 'https://example.auth0.com/',
    demoStaffSub: 'dev|demo-owner',
    demoStaffEmail: 'owner@demo.reclaimai.local',
    environment: 'production',
    ...overrides,
  };
}

const staff: StaffRow = {
  id: '22222222-2222-2222-2222-222222222222',
  tenant_id: '11111111-1111-1111-1111-111111111111',
  email: 'owner@demo.reclaimai.local',
  role: 'owner',
  auth0_sub: 'dev|demo-owner',
  tenant_name: 'Demo Kitchen',
};

function mockDb(partial: Partial<DatabaseService> = {}): DatabaseService {
  return {
    findStaffByAuth0Sub: jest.fn().mockResolvedValue(null),
    findStaffByEmail: jest.fn().mockResolvedValue(null),
    linkAuth0Sub: jest.fn().mockResolvedValue(undefined),
    ...partial,
  } as unknown as DatabaseService;
}

function httpContext(req: { headers: Record<string, string> }) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('StaffAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires Auth0 JWKS when bypass is false', async () => {
    const verify = jest.fn().mockResolvedValue({
      sub: 'auth0|shared-demo',
      email: 'owner@demo.reclaimai.local',
    });
    createOidcVerifierMock.mockReturnValue(verify as any);

    const db = mockDb({
      findStaffByAuth0Sub: jest.fn().mockResolvedValue(null),
      findStaffByEmail: jest.fn().mockResolvedValue(staff),
      linkAuth0Sub: jest.fn().mockResolvedValue(undefined),
    });
    const guard = new StaffAuthGuard(makeConfig({ authDevBypass: false }), db);
    const req: any = { headers: { authorization: 'Bearer access-token' } };

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);
    expect(verifyDevStaffTokenMock).not.toHaveBeenCalled();
    expect(createOidcVerifierMock).toHaveBeenCalled();
    expect(db.linkAuth0Sub).toHaveBeenCalledWith(staff.id, 'auth0|shared-demo');
    expect(req.authMode).toBe('auth0');
    expect(req.staff?.auth0_sub).toBe('auth0|shared-demo');
  });

  it('rejects when Auth0 is not configured and bypass is false', async () => {
    const guard = new StaffAuthGuard(
      makeConfig({
        authDevBypass: false,
        auth0Domain: '',
        auth0JwksUrl: '',
      }),
      mockDb(),
    );
    const req: any = { headers: { authorization: 'Bearer access-token' } };
    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
