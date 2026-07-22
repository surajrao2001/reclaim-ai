import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import type { ReclaimPrintPayload } from '../petpooja-webhook/petpooja-webhook.types';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly ttlSeconds: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
    this.ttlSeconds = config.webhookIdempotencyTtlSeconds;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  webhookKey(tenantId: string, petpoojaOrderId: string): string {
    return `webhook:petpooja:${tenantId}:${petpoojaOrderId}`;
  }

  async getWebhookResponse(
    tenantId: string,
    petpoojaOrderId: string,
  ): Promise<ReclaimPrintPayload | null> {
    const raw = await this.client.get(this.webhookKey(tenantId, petpoojaOrderId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ReclaimPrintPayload;
  }

  async setWebhookResponse(
    tenantId: string,
    petpoojaOrderId: string,
    payload: ReclaimPrintPayload,
  ): Promise<void> {
    await this.client.set(
      this.webhookKey(tenantId, petpoojaOrderId),
      JSON.stringify(payload),
      'EX',
      this.ttlSeconds,
    );
  }
}
