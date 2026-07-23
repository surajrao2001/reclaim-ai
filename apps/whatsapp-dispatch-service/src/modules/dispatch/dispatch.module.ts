import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { DispatchService } from './dispatch.service';
import { MetaWebhookController } from './meta-webhook.controller';

@Module({
  imports: [ProvidersModule],
  controllers: [MetaWebhookController],
  providers: [DispatchService, KafkaConsumerService],
  exports: [DispatchService],
})
export class DispatchModule {}
