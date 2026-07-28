import { Module } from '@nestjs/common';
import { PetpoojaWebhookModule } from '../petpooja-webhook/petpooja-webhook.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [PetpoojaWebhookModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
