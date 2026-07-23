import { Test } from '@nestjs/testing';
import { Kafka, logLevel } from 'kafkajs';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type MessageGeneratedPayload,
  type WhatsappDeliveredPayload,
} from '@reclaimai/shared-types';
import { APP_CONFIG, loadConfig } from '../src/config/configuration';
import { DatabaseService } from '../src/modules/database/database.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { KafkaProducerService } from '../src/modules/kafka/kafka-producer.service';
import { WhatsAppSenderService } from '../src/modules/providers/whatsapp-sender.service';
import { MetaWhatsAppClient } from '../src/modules/providers/meta-whatsapp.client';
import { GupshupWhatsAppClient } from '../src/modules/providers/gupshup-whatsapp.client';
import { DispatchService } from '../src/modules/dispatch/dispatch.service';

const shouldRun = process.env.RUN_INTEGRATION === '1';
const DEMO_TENANT = '11111111-1111-1111-1111-111111111111';

(shouldRun ? describe : describe.skip)('WhatsApp dispatch integration', () => {
  let database: DatabaseService;
  let redis: RedisService;
  let kafka: KafkaProducerService;
  let dispatch: DispatchService;

  beforeAll(async () => {
    process.env.WHATSAPP_MOCK = 'true';
    process.env.KAFKA_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: APP_CONFIG, useFactory: loadConfig },
        DatabaseService,
        RedisService,
        KafkaProducerService,
        MetaWhatsAppClient,
        GupshupWhatsAppClient,
        WhatsAppSenderService,
        DispatchService,
      ],
    }).compile();

    database = moduleRef.get(DatabaseService);
    redis = moduleRef.get(RedisService);
    kafka = moduleRef.get(KafkaProducerService);
    dispatch = moduleRef.get(DispatchService);

    await database.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_offer_id
        ON offers.whatsapp_messages (offer_id)
    `);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
    await redis.onModuleDestroy();
    await kafka.onModuleDestroy();
  });

  async function seedOffer(consent: boolean): Promise<{
    offerId: string;
    customerId: string;
  }> {
    const customerId = crypto.randomUUID();
    const offerId = crypto.randomUUID();
    const phone = `+9199${customerId.replace(/-/g, '').slice(0, 8)}`;

    await database.query(
      `INSERT INTO identity.customers (id, tenant_id, phone_number, consent_whatsapp)
       VALUES ($1, $2, $3, $4)`,
      [customerId, DEMO_TENANT, phone, consent],
    );

    await database.query(
      `INSERT INTO offers.offers (
          id, tenant_id, customer_id, max_margin_safe_discount_pct,
          max_discount_rupees, favorite_dish_name, status, scheduled_for
        ) VALUES ($1, $2, $3, 10, 50, 'Biryani', 'pending', now())`,
      [offerId, DEMO_TENANT, customerId],
    );

    return { offerId, customerId };
  }

  function buildEnvelope(
    offerId: string,
  ): EventEnvelope<MessageGeneratedPayload> {
    return {
      event_id: crypto.randomUUID(),
      event_type: KAFKA_TOPICS.MESSAGE_GENERATED,
      tenant_id: DEMO_TENANT,
      occurred_at: new Date().toISOString(),
      payload: {
        offer_id: offerId,
        message_body: 'Hey! Get ₹50 off your next biryani at Demo Kitchen.',
        selected_discount_value: 50,
        llm_model_used: 'template',
        prompt_version: 'hinglish-v1',
      },
    };
  }

  it('dispatches mock send, persists row, publishes whatsapp.delivered', async () => {
    const { offerId } = await seedOffer(true);
    const kafkaClient = new Kafka({
      clientId: 'wa-dispatch-it',
      brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:19092'],
      logLevel: logLevel.ERROR,
    });
    const consumer = kafkaClient.consumer({
      groupId: `wa-dispatch-it-${crypto.randomUUID()}`,
    });
    await consumer.connect();
    await consumer.subscribe({
      topic: KAFKA_TOPICS.WHATSAPP_DELIVERED,
      fromBeginning: false,
    });

    const delivered: EventEnvelope<WhatsappDeliveredPayload>[] = [];
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        delivered.push(
          JSON.parse(
            message.value.toString('utf8'),
          ) as EventEnvelope<WhatsappDeliveredPayload>,
        );
      },
    });

    await new Promise((r) => setTimeout(r, 1500));

    await dispatch.handleMessageGenerated(buildEnvelope(offerId));
    await dispatch.handleMessageGenerated(buildEnvelope(offerId));

    const deadline = Date.now() + 10_000;
    while (delivered.length < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    await consumer.disconnect();

    const row = await database.findWhatsappMessageByOfferId(offerId);
    expect(row).toBeTruthy();
    expect(row?.status).toBe('sent');
    expect(row?.wa_message_id).toMatch(/^mock-wamid-/);
    expect(row?.delivery_channel).toBe('meta_cloud_api');

    const { rows: offerRows } = await database.query<{ status: string }>(
      `SELECT status FROM offers.offers WHERE id = $1`,
      [offerId],
    );
    expect(offerRows[0]?.status).toBe('sent');

    expect(delivered.length).toBeGreaterThanOrEqual(1);
    const first = delivered[0]!;
    expect(first.payload.offer_id).toBe(offerId);
    expect(first.payload.status).toBe('sent');
  }, 30_000);

  it('does not publish success when consent is false', async () => {
    const { offerId } = await seedOffer(false);
    await dispatch.handleMessageGenerated(buildEnvelope(offerId));
    const row = await database.findWhatsappMessageByOfferId(offerId);
    expect(row?.status).toBe('failed');
    expect(row?.wa_message_id).toBeNull();
  });
});
