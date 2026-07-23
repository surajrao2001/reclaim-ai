import { Injectable, Logger } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type MessageGeneratedPayload,
  type WhatsAppMessageStatus,
} from '@reclaimai/shared-types';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { WhatsAppSenderService } from '../providers/whatsapp-sender.service';
import { maskPhone } from '../../common/phone';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaProducerService,
    private readonly sender: WhatsAppSenderService,
  ) {}

  async handleMessageGenerated(
    envelope: EventEnvelope<MessageGeneratedPayload>,
  ): Promise<void> {
    if (envelope.event_type !== KAFKA_TOPICS.MESSAGE_GENERATED) {
      this.logger.warn(`Ignoring unexpected event_type=${envelope.event_type}`);
      return;
    }

    const { offer_id: offerId, message_body: messageBody } = envelope.payload;
    if (!offerId || !messageBody) {
      this.logger.warn('message.generated missing offer_id or message_body');
      return;
    }

    const existingDb = await this.db.findWhatsappMessageByOfferId(offerId);
    if (existingDb && existingDb.status !== 'failed' && existingDb.wa_message_id) {
      this.logger.log(
        `Idempotent skip offer=${offerId} already status=${existingDb.status}`,
      );
      return;
    }

    const acquired = await this.redis.tryAcquireDispatchLock(offerId);
    if (!acquired) {
      const cached = await this.redis.getDispatchRecord(offerId);
      if (cached) {
        this.logger.log(`Idempotent skip offer=${offerId} redis cache hit`);
        return;
      }
      const again = await this.db.findWhatsappMessageByOfferId(offerId);
      if (again?.wa_message_id) {
        return;
      }
      this.logger.log(`Dispatch lock held for offer=${offerId}; skipping duplicate`);
      return;
    }

    try {
      const offer = await this.db.findOfferForDispatch(offerId);
      if (!offer) {
        this.logger.warn(`Offer not found offer=${offerId}`);
        await this.redis.releaseDispatchLock(offerId);
        return;
      }

      if (!offer.consent_whatsapp) {
        await this.db.upsertWhatsappMessage({
          offerId,
          waMessageId: null,
          deliveryChannel: 'meta_cloud_api',
          status: 'failed',
        });
        this.logger.log(
          `Skipped send (no consent) offer=${offerId} phone=${maskPhone(offer.phone_number)}`,
        );
        await this.redis.releaseDispatchLock(offerId);
        return;
      }

      const sendResult = await this.sender.send({
        phoneE164: offer.phone_number,
        messageBody,
        ctaUrl: envelope.payload.cta_url,
        selectedDiscountValue: envelope.payload.selected_discount_value,
      });

      const row = await this.db.upsertWhatsappMessage({
        offerId,
        waMessageId: sendResult.waMessageId,
        deliveryChannel: sendResult.deliveryChannel,
        status: 'sent',
      });

      await this.db.markOfferSent(offerId);

      await this.kafka.publishWhatsappDelivered(
        offer.tenant_id,
        {
          offer_id: offerId,
          wa_message_id: sendResult.waMessageId,
          delivery_channel: sendResult.deliveryChannel,
          status: 'sent',
        },
        envelope.trace_id,
      );

      await this.redis.setDispatchRecord(offerId, {
        wa_message_id: sendResult.waMessageId,
        delivery_channel: sendResult.deliveryChannel,
        status: 'sent',
      });

      this.logger.log(
        `Dispatched offer=${offerId} channel=${row.delivery_channel} wa_id=${sendResult.waMessageId}`,
      );
    } catch (error) {
      await this.db.upsertWhatsappMessage({
        offerId,
        waMessageId: null,
        deliveryChannel: 'meta_cloud_api',
        status: 'failed',
      });
      await this.redis.releaseDispatchLock(offerId);
      this.logger.error(
        `Dispatch failed offer=${offerId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }

  async handleMetaStatusUpdate(input: {
    waMessageId: string;
    status: WhatsAppMessageStatus;
    tenantIdHint?: string;
  }): Promise<void> {
    const updated = await this.db.updateWhatsappStatusByWaId(
      input.waMessageId,
      input.status,
    );
    if (!updated) {
      this.logger.warn(`No whatsapp_messages row for wa_id=${input.waMessageId}`);
      return;
    }

    const offer = await this.db.findOfferForDispatch(updated.offer_id);
    const tenantId = offer?.tenant_id ?? input.tenantIdHint;
    if (!tenantId || !updated.wa_message_id) {
      return;
    }

    await this.kafka.publishWhatsappDelivered(tenantId, {
      offer_id: updated.offer_id,
      wa_message_id: updated.wa_message_id,
      delivery_channel: updated.delivery_channel,
      status: updated.status,
    });
  }
}
