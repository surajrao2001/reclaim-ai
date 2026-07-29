import { HttpException, HttpStatus } from '@nestjs/common';
import {
  buildShowcasePetpoojaPayload,
  clientIpFromRequest,
  newDemoOrderId,
} from '../src/modules/demo/demo.types';
import { DemoService } from '../src/modules/demo/demo.service';
import { TurnstileService } from '../src/modules/demo/turnstile.service';
import type { AppConfig } from '../src/config/configuration';
import type { ReclaimPrintPayload } from '../src/modules/petpooja-webhook/petpooja-webhook.types';
import { signHmacSha256Hex, verifyHmacSha256Hex } from '../src/common/hmac';

describe('demo helpers', () => {
  it('builds a showcase Petpooja payload for pp_out_88219', () => {
    const payload = buildShowcasePetpoojaPayload('pp_out_88219', 'DEMO_1');
    expect(payload.restID).toBe('pp_out_88219');
    expect(payload.OrderInfo.Order.orderID).toBe('DEMO_1');
    expect(payload.OrderInfo.OrderItem.length).toBeGreaterThan(0);
  });

  it('generates unique demo order ids', () => {
    const a = newDemoOrderId();
    const b = newDemoOrderId();
    expect(a).toMatch(/^DEMO_\d+_[a-f0-9]+$/);
    expect(a).not.toBe(b);
  });

  it('prefers x-forwarded-for for client IP', () => {
    expect(
      clientIpFromRequest({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, '127.0.0.1'),
    ).toBe('203.0.113.9');
  });
});

describe('TurnstileService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('skips verification when secret is unset', async () => {
    const service = new TurnstileService('');
    await expect(service.verifyOrThrow(undefined, '1.1.1.1')).resolves.toBeUndefined();
    expect(service.enabled).toBe(false);
  });

  it('rejects missing token when secret is set', async () => {
    const service = new TurnstileService('test-secret');
    await expect(service.verifyOrThrow(undefined, '1.1.1.1')).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await service.verifyOrThrow('', '1.1.1.1');
    } catch (err) {
      const ex = err as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const body = ex.getResponse() as { error: { code: string } };
      expect(body.error.code).toBe('TURNSTILE_REQUIRED');
    }
  });

  it('accepts a valid siteverify response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;

    const service = new TurnstileService('test-secret');
    await expect(service.verifyOrThrow('tok', '203.0.113.1')).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects failed siteverify', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as unknown as typeof fetch;

    const service = new TurnstileService('test-secret');
    try {
      await service.verifyOrThrow('bad', '203.0.113.1');
      fail('expected throw');
    } catch (err) {
      const ex = err as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = ex.getResponse() as { error: { code: string } };
      expect(body.error.code).toBe('TURNSTILE_FAILED');
    }
  });
});

describe('DemoService', () => {
  const secret = 'unit-demo-secret';
  const config = {
    petpoojaWebhookSecret: secret,
    showcasePetpoojaRestId: 'pp_out_88219',
    demoSimulateRateLimitMax: 5,
    demoSimulateRateLimitWindowSeconds: 600,
    turnstileSecretKey: '',
  } as AppConfig;

  const printPayload: ReclaimPrintPayload = {
    status: 'success',
    message: 'Order ingested successfully',
    reclaim_print_payload: {
      print_sticker: true,
      qr_code_url: 'http://localhost:3101/c/demo-token',
      sticker_line_1: 'Claim ₹100 Instant UPI Cashback',
      sticker_line_2: 'Scan bill on WhatsApp to unlock',
    },
  };

  const turnstile = {
    verifyOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    turnstile.verifyOrThrow.mockClear();
  });

  it('signs and invokes the existing webhook service', async () => {
    const redis = {
      consumeDemoSimulateRateLimit: jest.fn().mockResolvedValue({ count: 1, allowed: true }),
    };
    const webhookService = {
      handleOrderCreated: jest.fn().mockResolvedValue(printPayload),
    };

    const service = new DemoService(
      config,
      redis as never,
      webhookService as never,
      turnstile as never,
    );

    const result = await service.simulateOrder('203.0.113.10', 'cf-token');

    expect(turnstile.verifyOrThrow).toHaveBeenCalledWith('cf-token', '203.0.113.10');
    expect(redis.consumeDemoSimulateRateLimit).toHaveBeenCalledWith('203.0.113.10', 5, 600);
    expect(webhookService.handleOrderCreated).toHaveBeenCalledTimes(1);

    const [rawBody, signature] = webhookService.handleOrderCreated.mock.calls[0] as [
      Buffer,
      string,
    ];
    expect(verifyHmacSha256Hex(rawBody, signature, secret)).toBe(true);

    const parsed = JSON.parse(rawBody.toString('utf8'));
    expect(parsed.restID).toBe('pp_out_88219');
    expect(parsed.OrderInfo.Order.orderID).toBe(result.order_id);
    expect(result.claim_url).toBe(printPayload.reclaim_print_payload.qr_code_url);
    expect(result.qr_code_url).toBe(result.claim_url);
    expect(result.order_id).toMatch(/^DEMO_/);
  });

  it('rejects when rate limit is exceeded', async () => {
    const redis = {
      consumeDemoSimulateRateLimit: jest.fn().mockResolvedValue({ count: 6, allowed: false }),
    };
    const webhookService = {
      handleOrderCreated: jest.fn(),
    };

    const service = new DemoService(
      config,
      redis as never,
      webhookService as never,
      turnstile as never,
    );

    await expect(service.simulateOrder('203.0.113.11')).rejects.toBeInstanceOf(HttpException);
    try {
      await service.simulateOrder('203.0.113.11');
    } catch (err) {
      const ex = err as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = ex.getResponse() as { error: { code: string; retryable: boolean } };
      expect(body.error.code).toBe('DEMO_RATE_LIMIT_EXCEEDED');
      expect(body.error.retryable).toBe(true);
    }
    expect(webhookService.handleOrderCreated).not.toHaveBeenCalled();
  });

  it('uses the same HMAC helper as the Petpooja webhook', () => {
    const raw = Buffer.from('{"restID":"pp_out_88219"}');
    const signature = signHmacSha256Hex(raw, secret);
    expect(verifyHmacSha256Hex(raw, signature, secret)).toBe(true);
  });
});
