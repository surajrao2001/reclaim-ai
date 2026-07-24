import { loadConfig } from '../src/config/configuration';

describe('loadConfig', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults authDevBypass when AUTH0_DOMAIN empty', () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH_DEV_BYPASS;
    const config = loadConfig();
    expect(config.authDevBypass).toBe(true);
  });

  it('respects AUTH_DEV_BYPASS=false', () => {
    process.env.AUTH0_DOMAIN = 'example.auth0.com';
    process.env.AUTH_DEV_BYPASS = 'false';
    const config = loadConfig();
    expect(config.authDevBypass).toBe(false);
    expect(config.auth0Issuer).toBe('https://example.auth0.com/');
  });
});
