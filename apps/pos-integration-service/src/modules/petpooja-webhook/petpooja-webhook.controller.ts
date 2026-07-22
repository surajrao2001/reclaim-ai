import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { PetpoojaWebhookService } from './petpooja-webhook.service';
import type { PetpoojaOrderWebhook } from './petpooja-webhook.types';

@Controller('v1/webhooks/petpooja')
export class PetpoojaWebhookController {
  constructor(private readonly webhookService: PetpoojaWebhookService) {}

  @Post('order')
  async ingestOrder(
    @Headers('x-petpooja-hmac-signature') signature: string | undefined,
    @Body() body: PetpoojaOrderWebhook,
  ) {
    if (!signature) {
      throw new UnauthorizedException({
        error: {
          code: 'WEBHOOK_SIGNATURE_MISSING',
          message: 'X-Petpooja-HMAC-Signature header is required',
          trace_id: crypto.randomUUID(),
          retryable: false,
        },
      });
    }

    return this.webhookService.handleOrderCreated(body, signature);
  }
}
