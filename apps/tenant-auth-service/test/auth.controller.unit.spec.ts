import { HttpException } from '@nestjs/common';
import { AuthController } from '../src/modules/auth/auth.controller';
import type { AppConfig } from '../src/config/configuration';

function makeConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    port: 3001,
    databaseUrl: 'postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai',
    authDevBypass: true,
    authDevSecret: 'test-secret',
    auth0Domain: '',
    auth0Audience: 'https://api.reclaimai.local',
    auth0JwksUrl: '',
    auth0Issuer: '',
    demoStaffSub: 'dev|demo-owner',
    demoStaffEmail: 'owner@demo.reclaimai.local',
    environment: 'development',
    ...overrides,
  };
}

describe('AuthController issueDevToken', () => {
  it('rejects when authDevBypass is false', async () => {
    const controller = new AuthController(makeConfig({ authDevBypass: false }));
    await expect(controller.issueDevToken()).rejects.toBeInstanceOf(HttpException);
    try {
      await controller.issueDevToken();
    } catch (err) {
      const body = (err as HttpException).getResponse() as {
        error: { code: string };
      };
      expect(body.error.code).toBe('DEV_BYPASS_DISABLED');
      expect((err as HttpException).getStatus()).toBe(403);
    }
  });

  it('rejects in production even if bypass flag true', async () => {
    const controller = new AuthController(
      makeConfig({ authDevBypass: true, environment: 'production' }),
    );
    await expect(controller.issueDevToken()).rejects.toBeInstanceOf(HttpException);
  });

  it('issues token when bypass enabled in development', async () => {
    const controller = new AuthController(makeConfig({ authDevBypass: true }));
    const issued = await controller.issueDevToken();
    expect(issued.token_type).toBe('Bearer');
    expect(issued.access_token.length).toBeGreaterThan(10);
    expect(issued.expires_in).toBe(60 * 60 * 8);
  });
});
