import { Module } from '@nestjs/common';
import { AppConfigModule } from './modules/config/app-config.module';
import { HealthController } from './modules/health/health.controller';
import { DatabaseModule } from './modules/database/database.module';
import { KafkaModule } from './modules/kafka/kafka.module';
import { PetpoojaWebhookModule } from './modules/petpooja-webhook/petpooja-webhook.module';
import { RedisModule } from './modules/redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    PetpoojaWebhookModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
