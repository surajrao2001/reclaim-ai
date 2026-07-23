import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type EventEnvelope,
  type MessageGeneratedPayload,
} from '@reclaimai/shared-types';
import { Kafka, type Consumer, logLevel } from 'kafkajs';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { DispatchService } from '../dispatch/dispatch.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumer: Consumer;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly dispatch: DispatchService,
  ) {
    const kafka = new Kafka({
      clientId: `${config.kafkaClientId}-consumer`,
      brokers: config.kafkaBootstrapServers.split(',').map((b) => b.trim()),
      logLevel: logLevel.ERROR,
    });
    this.consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.kafkaEnabled) {
      this.logger.warn('KAFKA_ENABLED=false — consumer not started');
      return;
    }
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.MESSAGE_GENERATED,
      fromBeginning: false,
    });
    this.running = true;
    void this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }
        try {
          const envelope = JSON.parse(
            message.value.toString('utf8'),
          ) as EventEnvelope<MessageGeneratedPayload>;
          await this.dispatch.handleMessageGenerated(envelope);
        } catch (error) {
          this.logger.error(
            `Failed handling message.generated: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      },
    });
    this.logger.log(`Consuming ${KAFKA_TOPICS.MESSAGE_GENERATED}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.running) {
      await this.consumer.disconnect();
      this.running = false;
    }
  }
}
