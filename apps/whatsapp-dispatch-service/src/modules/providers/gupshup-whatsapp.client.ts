import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { toWhatsAppDigits } from '../../common/phone';
import {
  ProviderSendError,
  type SendMessageInput,
  type SendMessageResult,
} from './provider.types';

/**
 * Gupshup WhatsApp outbound (BSP failover).
 * API: POST form to GUPSHUP_API_URL with apikey header.
 * @see https://docs.gupshup.io/docs/send-msg
 */
@Injectable()
export class GupshupWhatsAppClient {
  private readonly logger = new Logger(GupshupWhatsAppClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (
      !this.config.gupshupApiKey ||
      !this.config.gupshupSourceNumber ||
      !this.config.gupshupAppName
    ) {
      throw new ProviderSendError('Gupshup credentials not configured', false);
    }

    const destination = toWhatsAppDigits(input.phoneE164);
    const source = toWhatsAppDigits(this.config.gupshupSourceNumber);
    const message = JSON.stringify({
      type: 'text',
      text: input.messageBody,
    });

    const form = new URLSearchParams({
      channel: 'whatsapp',
      source,
      destination,
      message,
      'src.name': this.config.gupshupAppName,
    });

    const response = await this.fetchWithTimeout(this.config.gupshupApiUrl, {
      method: 'POST',
      headers: {
        apikey: this.config.gupshupApiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      this.logger.warn(
        `Gupshup send failed status=${response.status} retryable=${retryable}`,
      );
      throw new ProviderSendError(
        `Gupshup API error ${response.status}`,
        retryable,
        response.status,
      );
    }

    const waMessageId =
      (typeof json.messageId === 'string' && json.messageId) ||
      (typeof json.id === 'string' && json.id) ||
      `gupshup-${crypto.randomUUID()}`;

    return {
      waMessageId,
      deliveryChannel: 'gupshup_bsp',
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.providerTimeoutMs,
    );
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderSendError('Gupshup API timeout', true);
      }
      throw new ProviderSendError(
        `Gupshup network error: ${error instanceof Error ? error.message : 'unknown'}`,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
