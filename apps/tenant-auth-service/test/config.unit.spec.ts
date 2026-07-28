import { loadConfig } from '../src/config/configuration';

describe('loadConfig', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults authDevBypass when AUTH0_DOMAIN empty', () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH_DEV_BYPASS;
    process.env.NODE_ENV = 'development';
    const config = loadConfig();
    expect(config.authDevBypass).toBe(true);
  });

  it('respects AUTH_DEV_BYPASS=false', () => {
    process.env.AUTH0_DOMAIN = 'example.auth0.com';
    process.env.AUTH_DEV_BYPASS = 'false';
    process.env.NODE_ENV = 'development';
    const config = loadConfig();
    expect(config.authDevBypass).toBe(false);
    expect(config.auth0Issuer).toBe('https://example.auth0.com/');
  });

  it('forces authDevBypass false in production even if AUTH_DEV_BYPASS=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH0_DOMAIN = 'example.auth0.com';
    const config = loadConfig();
    expect(config.authDevBypass).toBe(false);
  });

  it('reads shared demo user email/sub from env', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH0_DEMO_USER_EMAIL = 'demo@example.com';
    process.env.AUTH0_DEMO_USER_SUB = 'auth0|shared-demo';
    const config = loadConfig();
    expect(config.demoStaffEmail).toBe('demo@example.com');
    expect(config.demoStaffSub).toBe('auth0|shared-demo');
  });
});
