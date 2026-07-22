import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256Hex(
  rawBody: Buffer | string,
  signatureHex: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = Buffer.from(signatureHex, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (provided.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(provided, expectedBuf);
}

export function signHmacSha256Hex(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
