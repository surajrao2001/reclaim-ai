import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../src/config/configuration';
import { signHmacSha256Hex } from '../src/common/hmac';
import { DatabaseService } from '../src/modules/database/database.service';
import { KafkaProducerService } from '../src/modules/kafka/kafka-producer.service';
import { PetpoojaWebhookService } from '../src/modules/petpooja-webhook/petpooja-webhook.service';
import { RedisService } from '../src/modules/redis/redis.service';

const sampleBody = {
  app_key: 'reclaim_prod_993810a831',
  restID: 'pp_out_88219',
  OrderInfo: {
    Order: {
      orderID: `PET_TEST_${Date.now()}`,
      order_type: 'Delivery',
      order_from: 'Zomato',
      total_amount: '550.00',
      discount_amount: '50.00',
      preorder_date: '2026-07-21 20:15:00',
    },
    Customer: {
      name: 'Zomato Customer',
      phone: '9900000000',
      address: 'Masked Address Sector 4',
    },
    OrderItem: [
      { id: 'item_101', name: 'Chicken Dum Biryani', quantity: '1', price: '350.00' },
    ],
  },
};

const shouldRun = process.env.RUN_INTEGRATION === '1';

(shouldRun ? describe : describe.skip)('PetpoojaWebhookService integration', () => {
  let service: PetpoojaWebhookService;
  let database: DatabaseService;
  let redis: RedisService;
  let kafka: KafkaProducerService;

  beforeAll(async () => {
    process.env.PETPOOJA_WEBHOOK_SECRET =
      process.env.PETPOOJA_WEBHOOK_SECRET ?? 'dev_petpooja_hmac_secret_change_me';

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: APP_CONFIG, useFactory: loadConfig },
        DatabaseService,
        RedisService,
        KafkaProducerService,
        PetpoojaWebhookService,
      ],
    }).compile();

    service = moduleRef.get(PetpoojaWebhookService);
    database = moduleRef.get(DatabaseService);
    redis = moduleRef.get(RedisService);
    kafka = moduleRef.get(KafkaProducerService);
  });

  afterAll(async () => {
    await database.onModuleDestroy();
    await redis.onModuleDestroy();
    await kafka.onModuleDestroy();
  });

  it('rejects invalid hmac', async () => {
    const raw = Buffer.from(JSON.stringify(sampleBody));
    await expect(service.handleOrderCreated(raw, 'bad-signature')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('ingests order idempotently', async () => {
    const raw = Buffer.from(JSON.stringify(sampleBody));
    const signature = signHmacSha256Hex(
      raw,
      process.env.PETPOOJA_WEBHOOK_SECRET ?? 'dev_petpooja_hmac_secret_change_me',
    );

    const first = await service.handleOrderCreated(raw, signature);
    const second = await service.handleOrderCreated(raw, signature);

    expect(first.status).toBe('success');
    expect(second).toEqual(first);

    const tenant = await database.findTenantByPetpoojaRestaurantId('pp_out_88219');
    expect(tenant).not.toBeNull();

    const { rows } = await database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM commerce.aggregator_orders
       WHERE tenant_id = $1 AND petpooja_order_id = $2`,
      [tenant!.id, sampleBody.OrderInfo.Order.orderID],
    );
    expect(rows[0]?.count).toBe('1');
  });
});
