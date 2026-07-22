import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PetpoojaOrderWebhook, ReclaimPrintPayload } from './petpooja-webhook.types';

@Injectable()
export class PetpoojaWebhookService {
  handleOrderCreated(body: PetpoojaOrderWebhook, signature: string): ReclaimPrintPayload {
    this.verifySignature(JSON.stringify(body), signature);

    const orderId = body.OrderInfo.Order.orderID;
    const claimToken = Buffer.from(`${body.restID}:${orderId}`).toString('base64url');
    const claimBaseUrl = process.env.CLAIM_WEB_BASE_URL ?? 'https://claim.reclaimai.in';
    const cashbackAmount = process.env.DEFAULT_CASHBACK_AMOUNT_INR ?? '100';

    // Persist + Kafka publish are wired in the POS integration milestone.
    return {
      status: 'success',
      message: 'Order ingested successfully',
      reclaim_print_payload: {
        print_sticker: true,
        qr_code_url: `${claimBaseUrl}/c/${claimToken}`,
        sticker_line_1: `Claim ₹${cashbackAmount} Instant UPI Cashback`,
        sticker_line_2: 'Scan bill on WhatsApp to unlock',
      },
    };
  }

  private verifySignature(rawBody: string, signature: string): void {
    const secret = process.env.PETPOOJA_WEBHOOK_SECRET;
    if (!secret) {
      throw new UnauthorizedException({
        error: {
          code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
          message: 'PETPOOJA_WEBHOOK_SECRET is not set',
          trace_id: crypto.randomUUID(),
          retryable: false,
        },
      });
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (
      provided.length !== expectedBuf.length ||
      !timingSafeEqual(provided, expectedBuf)
    ) {
      throw new UnauthorizedException({
        error: {
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: 'HMAC signature verification failed',
          trace_id: crypto.randomUUID(),
          retryable: false,
        },
      });
    }
  }
}
