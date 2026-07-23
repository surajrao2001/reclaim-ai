import { Module } from '@nestjs/common';
import { AppConfigModule } from './modules/config/app-config.module';
import { HealthController } from './modules/health/health.controller';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { KafkaModule } from './modules/kafka/kafka.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    DispatchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
