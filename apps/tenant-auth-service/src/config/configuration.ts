export interface AppConfig {
  port: number;
  databaseUrl: string;
  authDevBypass: boolean;
  authDevSecret: string;
  auth0Domain: string;
  auth0Audience: string;
  auth0JwksUrl: string;
  auth0Issuer: string;
  demoStaffSub: string;
  demoStaffEmail: string;
  environment: string;
}

export function loadConfig(): AppConfig {
  const databaseUrl = (
    process.env.DATABASE_URL ??
    'postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai'
  ).replace('postgresql+psycopg://', 'postgresql://');

  const auth0Domain = (process.env.AUTH0_DOMAIN ?? '').replace(/\/$/, '');
  const bypassEnv = process.env.AUTH_DEV_BYPASS;
  const authDevBypass =
    bypassEnv !== undefined && bypassEnv !== ''
      ? bypassEnv === 'true'
      : auth0Domain.length === 0;

  const issuer = auth0Domain ? `https://${auth0Domain}/` : '';
  const jwksUrl =
    process.env.AUTH0_JWKS_URL ||
    (auth0Domain ? `https://${auth0Domain}/.well-known/jwks.json` : '');

  return {
    port: Number(process.env.PORT ?? 3001),
    databaseUrl,
    authDevBypass,
    authDevSecret:
      process.env.AUTH_DEV_SECRET ?? 'dev_dashboard_auth_secret_change_me',
    auth0Domain,
    auth0Audience: process.env.AUTH0_AUDIENCE ?? 'https://api.reclaimai.local',
    auth0JwksUrl: jwksUrl,
    auth0Issuer: issuer,
    demoStaffSub: 'dev|demo-owner',
    demoStaffEmail: 'owner@demo.reclaimai.local',
    environment: process.env.NODE_ENV ?? 'development',
  };
}

export const APP_CONFIG = 'APP_CONFIG';
