import { Module } from '@nestjs/common';
import { HealthController } from './modules/health/health.controller';
import { PetpoojaWebhookModule } from './modules/petpooja-webhook/petpooja-webhook.module';

@Module({
  imports: [PetpoojaWebhookModule],
  controllers: [HealthController],
})
export class AppModule {}
