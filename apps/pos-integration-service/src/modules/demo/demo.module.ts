import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PetpoojaWebhookModule } from '../petpooja-webhook/petpooja-webhook.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [PetpoojaWebhookModule],
  controllers: [DemoController],
  providers: [
    DemoService,
    {
      provide: TurnstileService,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new TurnstileService(config.turnstileSecretKey),
    },
  ],
})
export class DemoModule {}
