import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { apiError } from '../../common/api-error';
import { verifyHmacSha256Hex } from '../../common/hmac';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import {
  assertPetpoojaOrderWebhook,
  buildClaimToken,
  buildPrintPayload,
  mapAggregator,
  mapOrderItems,
  toOrderCreatedPayload,
  type ReclaimPrintPayload,
} from './petpooja-webhook.types';

@Injectable()
export class PetpoojaWebhookService {
  private readonly logger = new Logger(PetpoojaWebhookService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async handleOrderCreated(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<ReclaimPrintPayload> {
    const traceId = crypto.randomUUID();

    if (!signature) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        'WEBHOOK_SIGNATURE_MISSING',
        'X-Petpooja-HMAC-Signature header is required',
      );
    }

    if (
      !verifyHmacSha256Hex(rawBody, signature, this.config.petpoojaWebhookSecret)
    ) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        'WEBHOOK_SIGNATURE_INVALID',
        'HMAC signature verification failed',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    let body;
    try {
      body = assertPetpoojaOrderWebhook(parsed);
    } catch {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_WEBHOOK_PAYLOAD',
        'Petpooja order webhook payload is missing required fields',
      );
    }

    const tenant = await this.database.findTenantByPetpoojaRestaurantId(body.restID);
    if (!tenant) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'TENANT_NOT_FOUND',
        `No tenant mapped for Petpooja restID ${body.restID}`,
      );
    }

    const cached = await this.redis.getWebhookResponse(tenant.id, body.OrderInfo.Order.orderID);
    if (cached) {
      this.logger.log(
        `Idempotent Redis hit tenant=${tenant.id} order=${body.OrderInfo.Order.orderID}`,
      );
      return cached;
    }

    const claimToken = buildClaimToken(body.restID, body.OrderInfo.Order.orderID);
    const claimQrUrl = `${this.config.claimWebBaseUrl}/c/${claimToken}`;
    const printPayload = buildPrintPayload(claimQrUrl, this.config.defaultCashbackAmountInr);

    const orderPayload = toOrderCreatedPayload(body, claimQrUrl);
    const orderedAt = new Date(orderPayload.ordered_at);

    const orderRow = await this.database.insertAggregatorOrderIdempotent({
      tenantId: tenant.id,
      petpoojaOrderId: orderPayload.petpooja_order_id,
      aggregator: mapAggregator(body.OrderInfo.Order.order_from),
      maskedCustomerRef: body.OrderInfo.Customer.phone || null,
      orderItems: mapOrderItems(body.OrderInfo.OrderItem),
      grossAmount: orderPayload.gross_amount,
      orderedAt,
    });

    if (orderRow.inserted) {
      await this.kafka.publishOrderCreated(tenant.id, orderPayload, traceId);
    } else {
      this.logger.log(
        `DB idempotent hit tenant=${tenant.id} order=${orderPayload.petpooja_order_id}; skipping Kafka`,
      );
    }

    await this.redis.setWebhookResponse(
      tenant.id,
      orderPayload.petpooja_order_id,
      printPayload,
    );

    return printPayload;
  }
}
