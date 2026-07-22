import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { apiError } from '../../common/api-error';
import { PetpoojaWebhookService } from './petpooja-webhook.service';

@Controller('v1/webhooks/petpooja')
export class PetpoojaWebhookController {
  constructor(private readonly webhookService: PetpoojaWebhookService) {}

  @Post('order')
  @HttpCode(200)
  async ingestOrder(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-petpooja-hmac-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RAW_BODY_MISSING',
        'Raw request body is required for HMAC verification',
      );
    }

    return this.webhookService.handleOrderCreated(rawBody, signature);
  }
}
