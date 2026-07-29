import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { apiError } from '../../common/api-error';

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly secretKey: string) {}

  get enabled(): boolean {
    return this.secretKey.trim().length > 0;
  }

  async verifyOrThrow(token: string | undefined, remoteIp: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    if (!token || !token.trim()) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TURNSTILE_REQUIRED',
        'Cloudflare Turnstile verification is required',
        false,
      );
    }

    const body = new URLSearchParams({
      secret: this.secretKey,
      response: token.trim(),
      remoteip: remoteIp,
    });

    let payload: SiteverifyResponse;
    try {
      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      payload = (await response.json()) as SiteverifyResponse;
    } catch (err) {
      this.logger.warn(`Turnstile siteverify failed: ${String(err)}`);
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'TURNSTILE_UNAVAILABLE',
        'Unable to verify Turnstile right now',
        true,
      );
    }

    if (!payload.success) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'TURNSTILE_FAILED',
        'Turnstile verification failed',
        false,
      );
    }
  }
}
