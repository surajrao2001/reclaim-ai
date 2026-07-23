import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type {
  WhatsAppDeliveryChannel,
  WhatsAppMessageStatus,
} from '@reclaimai/shared-types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

export interface DispatchCacheRecord {
  wa_message_id: string;
  delivery_channel: WhatsAppDeliveryChannel;
  status: WhatsAppMessageStatus;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly ttlSeconds: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
    this.ttlSeconds = config.dispatchIdempotencyTtlSeconds;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  dispatchKey(offerId: string): string {
    return `wa:dispatch:${offerId}`;
  }

  /** Returns true if this process won the lock (first dispatch). */
  async tryAcquireDispatchLock(offerId: string): Promise<boolean> {
    const result = await this.client.set(
      this.dispatchKey(offerId),
      'pending',
      'EX',
      this.ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async getDispatchRecord(offerId: string): Promise<DispatchCacheRecord | null> {
    const raw = await this.client.get(this.dispatchKey(offerId));
    if (!raw || raw === 'pending') {
      return null;
    }
    try {
      return JSON.parse(raw) as DispatchCacheRecord;
    } catch {
      return null;
    }
  }

  async setDispatchRecord(
    offerId: string,
    record: DispatchCacheRecord,
  ): Promise<void> {
    await this.client.set(
      this.dispatchKey(offerId),
      JSON.stringify(record),
      'EX',
      this.ttlSeconds,
    );
  }

  async releaseDispatchLock(offerId: string): Promise<void> {
    await this.client.del(this.dispatchKey(offerId));
  }
}
