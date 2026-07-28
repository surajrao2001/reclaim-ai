import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../src/config/configuration';
import { DatabaseService } from '../src/modules/database/database.service';
import { DemoService } from '../src/modules/demo/demo.service';
import { KafkaProducerService } from '../src/modules/kafka/kafka-producer.service';
import { PetpoojaWebhookService } from '../src/modules/petpooja-webhook/petpooja-webhook.service';
import { RedisService } from '../src/modules/redis/redis.service';

const shouldRun = process.env.RUN_INTEGRATION === '1';

(shouldRun ? describe : describe.skip)('DemoService integration', () => {
  let demo: DemoService;
  let database: DatabaseService;
  let redis: RedisService;
  let kafka: KafkaProducerService;
  let config: ReturnType<typeof loadConfig>;

  beforeAll(async () => {
    process.env.PETPOOJA_WEBHOOK_SECRET =
      process.env.PETPOOJA_WEBHOOK_SECRET ?? 'dev_petpooja_hmac_secret_change_me';
    process.env.DEMO_SIMULATE_RATE_LIMIT_MAX = '5';
    process.env.DEMO_SIMULATE_RATE_LIMIT_WINDOW_SECONDS = '600';

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: APP_CONFIG, useFactory: loadConfig },
        DatabaseService,
        RedisService,
        KafkaProducerService,
        PetpoojaWebhookService,
        DemoService,
      ],
    }).compile();

    demo = moduleRef.get(DemoService);
    database = moduleRef.get(DatabaseService);
    redis = moduleRef.get(RedisService);
    kafka = moduleRef.get(KafkaProducerService);
    config = moduleRef.get(APP_CONFIG);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
    await redis.onModuleDestroy();
    await kafka.onModuleDestroy();
  });

  it('simulates an order through the real webhook path', async () => {
    const ip = `demo-it-${Date.now()}`;
    const result = await demo.simulateOrder(ip);

    expect(result.status).toBe('success');
    expect(result.order_id).toMatch(/^DEMO_/);
    expect(result.claim_url).toContain('/c/');
    expect(result.qr_code_url).toBe(result.claim_url);
    expect(result.reclaim_print_payload.print_sticker).toBe(true);

    const tenant = await database.findTenantByPetpoojaRestaurantId(
      config.showcasePetpoojaRestId,
    );
    expect(tenant).not.toBeNull();

    const { rows } = await database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM commerce.aggregator_orders
       WHERE tenant_id = $1 AND petpooja_order_id = $2`,
      [tenant!.id, result.order_id],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('rate-limits repeated simulate calls from the same IP', async () => {
    const ip = `demo-rl-${Date.now()}`;
    const max = config.demoSimulateRateLimitMax;

    for (let i = 0; i < max; i += 1) {
      const result = await demo.simulateOrder(ip);
      expect(result.status).toBe('success');
    }

    await expect(demo.simulateOrder(ip)).rejects.toBeInstanceOf(HttpException);
    try {
      await demo.simulateOrder(ip);
    } catch (err) {
      const ex = err as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = ex.getResponse() as { error: { code: string } };
      expect(body.error.code).toBe('DEMO_RATE_LIMIT_EXCEEDED');
    }
  });
});
