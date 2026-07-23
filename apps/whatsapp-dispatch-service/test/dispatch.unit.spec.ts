import { toWhatsAppDigits, maskPhone } from '../src/common/phone';
import {
  isRetryableProviderError,
  ProviderSendError,
} from '../src/modules/providers/provider.types';
import { WhatsAppSenderService } from '../src/modules/providers/whatsapp-sender.service';
import type { AppConfig } from '../src/config/configuration';
import type { MetaWhatsAppClient } from '../src/modules/providers/meta-whatsapp.client';
import type { GupshupWhatsAppClient } from '../src/modules/providers/gupshup-whatsapp.client';
import { DispatchService } from '../src/modules/dispatch/dispatch.service';
import type { DatabaseService } from '../src/modules/database/database.service';
import type { RedisService } from '../src/modules/redis/redis.service';
import type { KafkaProducerService } from '../src/modules/kafka/kafka-producer.service';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type MessageGeneratedPayload,
} from '@reclaimai/shared-types';

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

describe('WhatsAppSenderService failover', () => {
  const baseConfig = {
    whatsappMock: false,
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

  it('fails over to Gupshup when Meta is retryable-failing', async () => {
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
