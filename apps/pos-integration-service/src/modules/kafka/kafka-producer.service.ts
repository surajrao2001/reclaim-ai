import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type OrderCreatedPayload,
} from '@reclaimai/shared-types';
import { Kafka, type Producer, logLevel } from 'kafkajs';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private connected = false;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
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

  async publishOrderCreated(
    tenantId: string,
    payload: OrderCreatedPayload,
    traceId: string,
  ): Promise<string> {
    await this.ensureConnected();

    const eventId = crypto.randomUUID();
    const envelope: EventEnvelope<OrderCreatedPayload> = {
      event_id: eventId,
      event_type: KAFKA_TOPICS.ORDER_CREATED,
      tenant_id: tenantId,
      trace_id: traceId,
      occurred_at: new Date().toISOString(),
      payload,
    };

    await this.producer.send({
      topic: KAFKA_TOPICS.ORDER_CREATED,
      messages: [
        {
          key: tenantId,
          value: JSON.stringify(envelope),
          headers: {
            trace_id: traceId,
            event_type: KAFKA_TOPICS.ORDER_CREATED,
          },
        },
      ],
    });

    this.logger.log(
      `Published ${KAFKA_TOPICS.ORDER_CREATED} event_id=${eventId} tenant=${tenantId}`,
    );

    return eventId;
  }
}
