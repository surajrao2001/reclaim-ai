export type WhatsAppSendMode = 'text' | 'template';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  kafkaBootstrapServers: string;
  kafkaClientId: string;
  kafkaGroupId: string;
  kafkaEnabled: boolean;
  whatsappMock: boolean;
  whatsappSendMode: WhatsAppSendMode;
  metaWaToken: string;
  metaWaPhoneNumberId: string;
  metaWaVerifyToken: string;
  metaWaTemplateName: string;
  metaWaTemplateLang: string;
  metaWaApiVersion: string;
  gupshupApiKey: string;
  gupshupAppName: string;
  gupshupSourceNumber: string;
  gupshupApiUrl: string;
  dispatchIdempotencyTtlSeconds: number;
  providerTimeoutMs: number;
}

export function loadConfig(): AppConfig {
  const databaseUrl = (
    process.env.DATABASE_URL ??
    'postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai'
  ).replace('postgresql+psycopg://', 'postgresql://');

  const metaWaToken = process.env.META_WA_TOKEN ?? '';
  const mockEnv = process.env.WHATSAPP_MOCK;
  const whatsappMock =
    mockEnv !== undefined && mockEnv !== ''
      ? mockEnv === 'true'
      : metaWaToken.length === 0;

  const sendModeRaw = (process.env.WHATSAPP_SEND_MODE ?? 'text').toLowerCase();
  const whatsappSendMode: WhatsAppSendMode =
    sendModeRaw === 'template' ? 'template' : 'text';

  return {
    port: Number(process.env.PORT ?? 3003),
    databaseUrl,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:19092',
    kafkaClientId: process.env.KAFKA_CLIENT_ID ?? 'whatsapp-dispatch-service',
    kafkaGroupId: process.env.KAFKA_GROUP_ID ?? 'whatsapp-dispatch-service',
    kafkaEnabled: (process.env.KAFKA_ENABLED ?? 'true') !== 'false',
    whatsappMock,
    whatsappSendMode,
    metaWaToken,
    metaWaPhoneNumberId: process.env.META_WA_PHONE_NUMBER_ID ?? '',
    metaWaVerifyToken: process.env.META_WA_VERIFY_TOKEN ?? 'dev_meta_wa_verify_token',
    metaWaTemplateName: process.env.META_WA_TEMPLATE_NAME ?? '',
    metaWaTemplateLang: process.env.META_WA_TEMPLATE_LANG ?? 'en',
    metaWaApiVersion: process.env.META_WA_API_VERSION ?? 'v21.0',
    gupshupApiKey: process.env.GUPSHUP_API_KEY ?? '',
    gupshupAppName: process.env.GUPSHUP_APP_NAME ?? '',
    gupshupSourceNumber: process.env.GUPSHUP_SOURCE_NUMBER ?? '',
    gupshupApiUrl:
      process.env.GUPSHUP_API_URL ?? 'https://api.gupshup.io/wa/api/v1/msg',
    dispatchIdempotencyTtlSeconds: Number(
      process.env.DISPATCH_IDEMPOTENCY_TTL_SECONDS ?? 60 * 60 * 24 * 14,
    ),
    providerTimeoutMs: Number(process.env.WHATSAPP_PROVIDER_TIMEOUT_MS ?? 10_000),
  };
}

export const APP_CONFIG = 'APP_CONFIG';
