import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { GupshupWhatsAppClient } from './gupshup-whatsapp.client';
import {
  isRetryableProviderError,
  ProviderSendError,
  type SendMessageInput,
  type SendMessageResult,
} from './provider.types';

@Injectable()
export class WhatsAppSenderService {
  private readonly logger = new Logger(WhatsAppSenderService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly meta: MetaWhatsAppClient,
    private readonly gupshup: GupshupWhatsAppClient,
  ) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (this.config.whatsappMock) {
      const waMessageId = `mock-wamid-${crypto.randomUUID()}`;
      this.logger.log(`WHATSAPP_MOCK send wa_message_id=${waMessageId}`);
      return {
        waMessageId,
        deliveryChannel: 'meta_cloud_api',
      };
    }

    try {
      return await this.meta.send(input);
    } catch (error) {
      if (!isRetryableProviderError(error)) {
        throw error;
      }
      this.logger.warn(
        `Meta failed (${error instanceof Error ? error.message : 'error'}); trying Gupshup failover`,
      );
      try {
        return await this.gupshup.send(input);
      } catch (failoverError) {
        throw new ProviderSendError(
          `Meta and Gupshup both failed: ${failoverError instanceof Error ? failoverError.message : 'unknown'}`,
          true,
        );
      }
    }
  }
}
