import { Module } from '@nestjs/common';
import { PetpoojaWebhookController } from './petpooja-webhook.controller';
import { PetpoojaWebhookService } from './petpooja-webhook.service';

@Module({
  controllers: [PetpoojaWebhookController],
  providers: [PetpoojaWebhookService],
})
export class PetpoojaWebhookModule {}
