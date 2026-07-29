import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { apiError } from '../../common/api-error';
import { signHmacSha256Hex } from '../../common/hmac';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PetpoojaWebhookService } from '../petpooja-webhook/petpooja-webhook.service';
import { RedisService } from '../redis/redis.service';
import {
  buildShowcasePetpoojaPayload,
  newDemoOrderId,
  type SimulateOrderResponse,
} from './demo.types';
import { TurnstileService } from './turnstile.service';

@Injectable()
export class DemoService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly webhookService: PetpoojaWebhookService,
    private readonly turnstile: TurnstileService,
  ) {}

  async simulateOrder(
    clientIp: string,
    turnstileToken?: string,
  ): Promise<SimulateOrderResponse> {
    await this.turnstile.verifyOrThrow(turnstileToken, clientIp);

    const rate = await this.redis.consumeDemoSimulateRateLimit(
      clientIp,
      this.config.demoSimulateRateLimitMax,
      this.config.demoSimulateRateLimitWindowSeconds,
    );

    if (!rate.allowed) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'DEMO_RATE_LIMIT_EXCEEDED',
        `Simulate Order is limited to ${this.config.demoSimulateRateLimitMax} requests per ${Math.floor(this.config.demoSimulateRateLimitWindowSeconds / 60)} minutes`,
        true,
      );
    }

    const orderId = newDemoOrderId();
    const body = buildShowcasePetpoojaPayload(
      this.config.showcasePetpoojaRestId,
      orderId,
    );
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = signHmacSha256Hex(
      rawBody,
      this.config.petpoojaWebhookSecret,
    );

    const printPayload = await this.webhookService.handleOrderCreated(
      rawBody,
      signature,
    );

    const claimUrl = printPayload.reclaim_print_payload.qr_code_url;

    return {
      order_id: orderId,
      claim_url: claimUrl,
      qr_code_url: claimUrl,
      status: printPayload.status,
      message: printPayload.message,
      reclaim_print_payload: printPayload.reclaim_print_payload,
    };
  }
}
