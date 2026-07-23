import type { WhatsAppDeliveryChannel } from '@reclaimai/shared-types';

export interface SendMessageInput {
  phoneE164: string;
  messageBody: string;
  ctaUrl?: string;
  selectedDiscountValue?: number;
}

export interface SendMessageResult {
  waMessageId: string;
  deliveryChannel: WhatsAppDeliveryChannel;
}

export class ProviderSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ProviderSendError';
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderSendError) {
    return error.retryable;
  }
  return true;
}
