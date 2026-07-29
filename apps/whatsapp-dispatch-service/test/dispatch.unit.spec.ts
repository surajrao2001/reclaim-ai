import {
  assertLiveMetaCredentials,
  isGupshupConfigured,
  loadConfig,
  resolveWhatsAppMock,
  type AppConfig,
} from '../src/config/configuration';
import { toWhatsAppDigits, maskPhone } from '../src/common/phone';
import {
  isRetryableProviderError,
  ProviderSendError,
} from '../src/modules/providers/provider.types';
import { WhatsAppSenderService } from '../src/modules/providers/whatsapp-sender.service';
import { MetaWhatsAppClient } from '../src/modules/providers/meta-whatsapp.client';
import type { GupshupWhatsAppClient } from '../src/modules/providers/gupshup-whatsapp.client';
import { DispatchService } from '../src/modules/dispatch/dispatch.service';
import { MetaWebhookController } from '../src/modules/dispatch/meta-webhook.controller';
import type { DatabaseService } from '../src/modules/database/database.service';
import type { RedisService } from '../src/modules/redis/redis.service';
import type { KafkaProducerService } from '../src/modules/kafka/kafka-producer.service';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type MessageGeneratedPayload,
} from '@reclaimai/shared-types';
import { HttpException } from '@nestjs/common';

describe('phone helpers', () => {
  it('strips non-digits', () => {
    expect(toWhatsAppDigits('+91 98765-43210')).toBe('919876543210');
  });

  it('masks leaving last 4', () => {
    expect(maskPhone('+919876543210')).toBe('********3210');
  });
});

describe('provider error helpers', () => {
  it('treats 5xx ProviderSendError as retryable', () => {
    expect(isRetryableProviderError(new ProviderSendError('x', true, 503))).toBe(
      true,
    );
  });

  it('treats non-retryable ProviderSendError as not retryable', () => {
    expect(
      isRetryableProviderError(new ProviderSendError('bad config', false, 400)),
    ).toBe(false);
  });
});

describe('WhatsApp config (mock / live)', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to mock when WHATSAPP_MOCK unset and token empty', () => {
    expect(resolveWhatsAppMock(undefined, '')).toBe(true);
  });

  it('defaults to live when WHATSAPP_MOCK unset and token present', () => {
    expect(resolveWhatsAppMock(undefined, 'EAA...')).toBe(false);
  });

  it('honours explicit WHATSAPP_MOCK=false', () => {
    expect(resolveWhatsAppMock('false', '')).toBe(false);
  });

  it('honours explicit WHATSAPP_MOCK=true even with token', () => {
    expect(resolveWhatsAppMock('true', 'EAA...')).toBe(true);
  });

  it('refuses live mode without Meta token/phone id', () => {
    expect(() =>
      assertLiveMetaCredentials({
        whatsappMock: false,
        metaWaToken: '',
        metaWaPhoneNumberId: '',
        whatsappSendMode: 'text',
        metaWaTemplateName: '',
      }),
    ).toThrow(/META_WA_TOKEN/);
  });

  it('refuses live template mode without template name', () => {
    expect(() =>
      assertLiveMetaCredentials({
        whatsappMock: false,
        metaWaToken: 'tok',
        metaWaPhoneNumberId: '123',
        whatsappSendMode: 'template',
        metaWaTemplateName: '',
      }),
    ).toThrow(/META_WA_TEMPLATE_NAME/);
  });

  it('allows mock mode with empty Meta credentials', () => {
    expect(() =>
      assertLiveMetaCredentials({
        whatsappMock: true,
        metaWaToken: '',
        metaWaPhoneNumberId: '',
        whatsappSendMode: 'template',
        metaWaTemplateName: '',
      }),
    ).not.toThrow();
  });

  it('loadConfig throws when WHATSAPP_MOCK=false and token empty', () => {
    process.env = {
      ...originalEnv,
      WHATSAPP_MOCK: 'false',
      META_WA_TOKEN: '',
      META_WA_PHONE_NUMBER_ID: '',
      KAFKA_ENABLED: 'false',
    };
    expect(() => loadConfig()).toThrow(/WHATSAPP_MOCK=false/);
  });

  it('loadConfig accepts live Meta + template mode', () => {
    process.env = {
      ...originalEnv,
      WHATSAPP_MOCK: 'false',
      WHATSAPP_SEND_MODE: 'template',
      META_WA_TOKEN: 'EAA_test',
      META_WA_PHONE_NUMBER_ID: '1001',
      META_WA_TEMPLATE_NAME: 'reclaimai_offer',
      META_WA_TEMPLATE_LANG: 'en',
      KAFKA_ENABLED: 'false',
    };
    const config = loadConfig();
    expect(config.whatsappMock).toBe(false);
    expect(config.whatsappSendMode).toBe('template');
    expect(config.metaWaTemplateName).toBe('reclaimai_offer');
  });

  it('isGupshupConfigured is false when keys empty (portfolio path)', () => {
    expect(
      isGupshupConfigured({
        gupshupApiKey: '',
        gupshupAppName: '',
        gupshupSourceNumber: '',
      }),
    ).toBe(false);
  });
});

describe('WhatsAppSenderService failover', () => {
  const baseConfig = {
    whatsappMock: false,
    gupshupApiKey: 'gk',
    gupshupAppName: 'app',
    gupshupSourceNumber: '919999999999',
  } as AppConfig;

  it('returns mock id when WHATSAPP_MOCK', async () => {
    const sender = new WhatsAppSenderService(
      { ...baseConfig, whatsappMock: true },
      {} as MetaWhatsAppClient,
      {} as GupshupWhatsAppClient,
    );
    const result = await sender.send({
      phoneE164: '+919999999999',
      messageBody: 'hello',
    });
    expect(result.deliveryChannel).toBe('meta_cloud_api');
    expect(result.waMessageId).toMatch(/^mock-wamid-/);
  });

  it('fails over to Gupshup when Meta is retryable-failing and Gupshup configured', async () => {
    const meta = {
      send: jest.fn().mockRejectedValue(new ProviderSendError('timeout', true)),
    };
    const gupshup = {
      send: jest.fn().mockResolvedValue({
        waMessageId: 'gs-1',
        deliveryChannel: 'gupshup_bsp',
      }),
    };
    const sender = new WhatsAppSenderService(
      baseConfig,
      meta as unknown as MetaWhatsAppClient,
      gupshup as unknown as GupshupWhatsAppClient,
    );
    const result = await sender.send({
      phoneE164: '+919999999999',
      messageBody: 'offer',
    });
    expect(result.waMessageId).toBe('gs-1');
    expect(result.deliveryChannel).toBe('gupshup_bsp');
    expect(gupshup.send).toHaveBeenCalledTimes(1);
  });

  it('does not failover when Gupshup is not configured (portfolio)', async () => {
    const meta = {
      send: jest.fn().mockRejectedValue(new ProviderSendError('timeout', true)),
    };
    const gupshup = { send: jest.fn() };
    const sender = new WhatsAppSenderService(
      {
        ...baseConfig,
        gupshupApiKey: '',
        gupshupAppName: '',
        gupshupSourceNumber: '',
      },
      meta as unknown as MetaWhatsAppClient,
      gupshup as unknown as GupshupWhatsAppClient,
    );
    await expect(
      sender.send({ phoneE164: '+919999999999', messageBody: 'x' }),
    ).rejects.toThrow('timeout');
    expect(gupshup.send).not.toHaveBeenCalled();
  });

  it('does not failover on non-retryable Meta errors', async () => {
    const meta = {
      send: jest
        .fn()
        .mockRejectedValue(new ProviderSendError('bad token', false, 401)),
    };
    const gupshup = { send: jest.fn() };
    const sender = new WhatsAppSenderService(
      baseConfig,
      meta as unknown as MetaWhatsAppClient,
      gupshup as unknown as GupshupWhatsAppClient,
    );
    await expect(
      sender.send({ phoneE164: '+919999999999', messageBody: 'x' }),
    ).rejects.toThrow('bad token');
    expect(gupshup.send).not.toHaveBeenCalled();
  });
});

describe('MetaWhatsAppClient template mode', () => {
  const liveConfig = {
    whatsappMock: false,
    whatsappSendMode: 'template',
    metaWaToken: 'EAA_test',
    metaWaPhoneNumberId: '1001',
    metaWaTemplateName: 'reclaimai_offer',
    metaWaTemplateLang: 'en',
    metaWaApiVersion: 'v21.0',
    providerTimeoutMs: 5_000,
  } as AppConfig;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs template payload with body vars message, discount, cta', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.tpl1' }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new MetaWhatsAppClient(liveConfig);
    const result = await client.send({
      phoneE164: '+919876543210',
      messageBody: 'Hey! Get ₹50 off.',
      selectedDiscountValue: 50,
      ctaUrl: 'https://demo.example/c/abc',
    });

    expect(result.waMessageId).toBe('wamid.tpl1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      type: string;
      template: {
        name: string;
        components: Array<{ parameters: Array<{ text: string }> }>;
      };
    };
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('reclaimai_offer');
    const params = body.template.components[0]?.parameters ?? [];
    expect(params.map((p) => p.text)).toEqual([
      'Hey! Get ₹50 off.',
      '50',
      'https://demo.example/c/abc',
    ]);
  });

  it('throws when template mode lacks META_WA_TEMPLATE_NAME', async () => {
    const client = new MetaWhatsAppClient({
      ...liveConfig,
      metaWaTemplateName: '',
    });
    await expect(
      client.send({ phoneE164: '+919876543210', messageBody: 'x' }),
    ).rejects.toThrow(/META_WA_TEMPLATE_NAME/);
  });
});

describe('MetaWebhookController verify', () => {
  const config = {
    metaWaVerifyToken: 'demo_verify_token',
  } as AppConfig;

  it('returns hub.challenge when verify token matches', () => {
    const controller = new MetaWebhookController(
      config,
      {} as DispatchService,
    );
    expect(
      controller.verify('subscribe', 'demo_verify_token', 'challenge-123'),
    ).toBe('challenge-123');
  });

  it('rejects bad verify token', () => {
    const controller = new MetaWebhookController(
      config,
      {} as DispatchService,
    );
    expect(() =>
      controller.verify('subscribe', 'wrong', 'challenge-123'),
    ).toThrow(HttpException);
  });
});

describe('DispatchService', () => {
  function envelope(
    offerId: string,
  ): EventEnvelope<MessageGeneratedPayload> {
    return {
      event_id: crypto.randomUUID(),
      event_type: KAFKA_TOPICS.MESSAGE_GENERATED,
      tenant_id: '11111111-1111-1111-1111-111111111111',
      occurred_at: new Date().toISOString(),
      payload: {
        offer_id: offerId,
        message_body: 'Hey! Get ₹50 off your next biryani.',
        selected_discount_value: 50,
        llm_model_used: 'template',
        prompt_version: 'v1',
      },
    };
  }

  it('skips provider send when consent_whatsapp is false', async () => {
    const offerId = crypto.randomUUID();
    const db = {
      findWhatsappMessageByOfferId: jest.fn().mockResolvedValue(null),
      findOfferForDispatch: jest.fn().mockResolvedValue({
        offer_id: offerId,
        tenant_id: '11111111-1111-1111-1111-111111111111',
        customer_id: crypto.randomUUID(),
        offer_status: 'pending',
        phone_number: '+919876543210',
        consent_whatsapp: false,
      }),
      upsertWhatsappMessage: jest.fn().mockResolvedValue({}),
      markOfferSent: jest.fn(),
    };
    const redis = {
      tryAcquireDispatchLock: jest.fn().mockResolvedValue(true),
      releaseDispatchLock: jest.fn(),
      setDispatchRecord: jest.fn(),
      getDispatchRecord: jest.fn(),
    };
    const kafka = { publishWhatsappDelivered: jest.fn() };
    const sender = { send: jest.fn() };

    const service = new DispatchService(
      db as unknown as DatabaseService,
      redis as unknown as RedisService,
      kafka as unknown as KafkaProducerService,
      sender as unknown as WhatsAppSenderService,
    );

    await service.handleMessageGenerated(envelope(offerId));

    expect(sender.send).not.toHaveBeenCalled();
    expect(kafka.publishWhatsappDelivered).not.toHaveBeenCalled();
    expect(db.upsertWhatsappMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('is idempotent when a successful row already exists', async () => {
    const offerId = crypto.randomUUID();
    const db = {
      findWhatsappMessageByOfferId: jest.fn().mockResolvedValue({
        id: crypto.randomUUID(),
        offer_id: offerId,
        wa_message_id: 'wamid.existing',
        delivery_channel: 'meta_cloud_api',
        status: 'sent',
      }),
      findOfferForDispatch: jest.fn(),
      upsertWhatsappMessage: jest.fn(),
    };
    const redis = {
      tryAcquireDispatchLock: jest.fn(),
    };
    const kafka = { publishWhatsappDelivered: jest.fn() };
    const sender = { send: jest.fn() };

    const service = new DispatchService(
      db as unknown as DatabaseService,
      redis as unknown as RedisService,
      kafka as unknown as KafkaProducerService,
      sender as unknown as WhatsAppSenderService,
    );

    await service.handleMessageGenerated(envelope(offerId));

    expect(redis.tryAcquireDispatchLock).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sends, persists, and publishes on success (mock path)', async () => {
    const offerId = crypto.randomUUID();
    const db = {
      findWhatsappMessageByOfferId: jest.fn().mockResolvedValue(null),
      findOfferForDispatch: jest.fn().mockResolvedValue({
        offer_id: offerId,
        tenant_id: '11111111-1111-1111-1111-111111111111',
        customer_id: crypto.randomUUID(),
        offer_status: 'pending',
        phone_number: '+919876543210',
        consent_whatsapp: true,
      }),
      upsertWhatsappMessage: jest.fn().mockResolvedValue({
        delivery_channel: 'meta_cloud_api',
      }),
      markOfferSent: jest.fn(),
    };
    const redis = {
      tryAcquireDispatchLock: jest.fn().mockResolvedValue(true),
      releaseDispatchLock: jest.fn(),
      setDispatchRecord: jest.fn(),
      getDispatchRecord: jest.fn(),
    };
    const kafka = { publishWhatsappDelivered: jest.fn() };
    const sender = {
      send: jest.fn().mockResolvedValue({
        waMessageId: 'mock-wamid-1',
        deliveryChannel: 'meta_cloud_api',
      }),
    };

    const service = new DispatchService(
      db as unknown as DatabaseService,
      redis as unknown as RedisService,
      kafka as unknown as KafkaProducerService,
      sender as unknown as WhatsAppSenderService,
    );

    await service.handleMessageGenerated(envelope(offerId));

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(db.markOfferSent).toHaveBeenCalledWith(offerId);
    expect(kafka.publishWhatsappDelivered).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        offer_id: offerId,
        wa_message_id: 'mock-wamid-1',
        status: 'sent',
      }),
      undefined,
    );
  });

  it('advances status from Meta webhook and republishes delivery event', async () => {
    const offerId = crypto.randomUUID();
    const db = {
      updateWhatsappStatusByWaId: jest.fn().mockResolvedValue({
        id: crypto.randomUUID(),
        offer_id: offerId,
        wa_message_id: 'wamid.abc',
        delivery_channel: 'meta_cloud_api',
        status: 'delivered',
      }),
      findOfferForDispatch: jest.fn().mockResolvedValue({
        offer_id: offerId,
        tenant_id: '11111111-1111-1111-1111-111111111111',
        customer_id: crypto.randomUUID(),
        offer_status: 'sent',
        phone_number: '+919876543210',
        consent_whatsapp: true,
      }),
    };
    const redis = {};
    const kafka = { publishWhatsappDelivered: jest.fn() };
    const sender = { send: jest.fn() };

    const service = new DispatchService(
      db as unknown as DatabaseService,
      redis as unknown as RedisService,
      kafka as unknown as KafkaProducerService,
      sender as unknown as WhatsAppSenderService,
    );

    await service.handleMetaStatusUpdate({
      waMessageId: 'wamid.abc',
      status: 'delivered',
    });

    expect(db.updateWhatsappStatusByWaId).toHaveBeenCalledWith(
      'wamid.abc',
      'delivered',
    );
    expect(kafka.publishWhatsappDelivered).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        offer_id: offerId,
        wa_message_id: 'wamid.abc',
        status: 'delivered',
      }),
    );
  });
});
