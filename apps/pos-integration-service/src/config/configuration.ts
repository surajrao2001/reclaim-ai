export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  kafkaBootstrapServers: string;
  kafkaClientId: string;
  petpoojaWebhookSecret: string;
  claimWebBaseUrl: string;
  defaultCashbackAmountInr: string;
  webhookIdempotencyTtlSeconds: number;
  showcasePetpoojaRestId: string;
  demoSimulateRateLimitMax: number;
  demoSimulateRateLimitWindowSeconds: number;
  corsOrigins: string[];
}

export function loadConfig(): AppConfig {
  const databaseUrl = (
    process.env.DATABASE_URL ??
    'postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai'
  ).replace('postgresql+psycopg://', 'postgresql://');

  return {
    port: Number(process.env.PORT ?? 3002),
    databaseUrl,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:19092',
    kafkaClientId: process.env.KAFKA_CLIENT_ID ?? 'pos-integration-service',
    petpoojaWebhookSecret:
      process.env.PETPOOJA_WEBHOOK_SECRET ?? 'dev_petpooja_hmac_secret_change_me',
    claimWebBaseUrl: process.env.CLAIM_WEB_BASE_URL ?? 'http://localhost:3101',
    defaultCashbackAmountInr: process.env.DEFAULT_CASHBACK_AMOUNT_INR ?? '100',
    webhookIdempotencyTtlSeconds: Number(
      process.env.WEBHOOK_IDEMPOTENCY_TTL_SECONDS ?? 60 * 60 * 24 * 7,
    ),
    showcasePetpoojaRestId:
      process.env.SHOWCASE_PETPOOJA_REST_ID ?? 'pp_out_88219',
    demoSimulateRateLimitMax: Number(
      process.env.DEMO_SIMULATE_RATE_LIMIT_MAX ?? 5,
    ),
    demoSimulateRateLimitWindowSeconds: Number(
      process.env.DEMO_SIMULATE_RATE_LIMIT_WINDOW_SECONDS ?? 600,
    ),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3101')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

export const APP_CONFIG = 'APP_CONFIG';
