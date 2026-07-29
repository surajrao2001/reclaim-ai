import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { toWhatsAppDigits } from '../../common/phone';
import {
  ProviderSendError,
  type SendMessageInput,
  type SendMessageResult,
} from './provider.types';

@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.config.metaWaToken || !this.config.metaWaPhoneNumberId) {
      throw new ProviderSendError(
        'Meta WhatsApp credentials not configured',
        false,
      );
    }

    const to = toWhatsAppDigits(input.phoneE164);
    const url = `https://graph.facebook.com/${this.config.metaWaApiVersion}/${this.config.metaWaPhoneNumberId}/messages`;

    const body =
      this.config.whatsappSendMode === 'template'
        ? this.buildTemplateBody(to, input)
        : {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { preview_url: Boolean(input.ctaUrl), body: input.messageBody },
          };

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.metaWaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
        `Meta send failed status=${response.status} retryable=${retryable}`,
      );
      throw new ProviderSendError(
        `Meta Cloud API error ${response.status}`,
        retryable,
        response.status,
      );
    }

    const messages = json.messages as Array<{ id?: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new ProviderSendError('Meta response missing message id', true);
    }

    return {
      waMessageId,
      deliveryChannel: 'meta_cloud_api',
    };
  }

  /**
   * Builds a marketing/utility template payload.
   *
   * Approved Meta template body variables must match this order:
   *   {{1}} = offer message body (always)
   *   {{2}} = selected discount value INR (when present on the event)
   *   {{3}} = CTA URL (when present on the event)
   *
   * Example template body:
   *   "{{1}} Save ₹{{2}}. Claim: {{3}}"
   * Or a single-var template "{{1}}" if your pipeline never sets discount/cta
   * (prefer a 2–3 var template for the hosted demo offer flow).
   */
  private buildTemplateBody(
    to: string,
    input: SendMessageInput,
  ): Record<string, unknown> {
    if (!this.config.metaWaTemplateName) {
      throw new ProviderSendError(
        'META_WA_TEMPLATE_NAME required when WHATSAPP_SEND_MODE=template',
        false,
      );
    }

    const parameters: Array<{ type: string; text: string }> = [
      { type: 'text', text: input.messageBody.slice(0, 1024) },
    ];
    if (input.selectedDiscountValue !== undefined) {
      parameters.push({
        type: 'text',
        text: String(input.selectedDiscountValue),
      });
    }
    if (input.ctaUrl) {
      parameters.push({ type: 'text', text: input.ctaUrl.slice(0, 1024) });
    }

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.config.metaWaTemplateName,
        language: { code: this.config.metaWaTemplateLang },
        components: [
          {
            type: 'body',
            parameters,
          },
        ],
      },
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
        throw new ProviderSendError('Meta Cloud API timeout', true);
      }
      throw new ProviderSendError(
        `Meta Cloud API network error: ${error instanceof Error ? error.message : 'unknown'}`,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
