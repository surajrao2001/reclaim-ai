import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type WhatsappDeliveredPayload,
} from '@reclaimai/shared-types';
import { Kafka, type Producer, logLevel } from 'kafkajs';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private connected = false;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const kafka = new Kafka({
      clientId: config.kafkaClientId,
      brokers: config.kafkaBootstrapServers.split(',').map((b) => b.trim()),
      logLevel: logLevel.ERROR,
    });
    this.producer = kafka.producer();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  async publishWhatsappDelivered(
    tenantId: string,
    payload: WhatsappDeliveredPayload,
    traceId?: string,
  ): Promise<string> {
    await this.ensureConnected();

    const eventId = crypto.randomUUID();
    const envelope: EventEnvelope<WhatsappDeliveredPayload> = {
      event_id: eventId,
      event_type: KAFKA_TOPICS.WHATSAPP_DELIVERED,
      tenant_id: tenantId,
      trace_id: traceId,
      occurred_at: new Date().toISOString(),
      payload,
    };

    await this.producer.send({
      topic: KAFKA_TOPICS.WHATSAPP_DELIVERED,
      messages: [
        {
          key: tenantId,
          value: JSON.stringify(envelope),
          headers: {
            ...(traceId ? { trace_id: traceId } : {}),
            event_type: KAFKA_TOPICS.WHATSAPP_DELIVERED,
          },
        },
      ],
    });

    this.logger.log(
      `Published ${KAFKA_TOPICS.WHATSAPP_DELIVERED} event_id=${eventId} offer=${payload.offer_id} status=${payload.status}`,
    );

    return eventId;
  }
}
