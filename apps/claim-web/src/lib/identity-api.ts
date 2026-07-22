import type {
  ClaimContextResponse,
  ClaimOtpRequestResponse,
  ClaimOtpVerifyResponse,
  ApiErrorBody,
} from '@reclaimai/shared-types';

const IDENTITY_API =
  process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:8001';

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const err = body as ApiErrorBody;
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return body as T;
}

export async function fetchClaimContext(token: string): Promise<ClaimContextResponse> {
  const response = await fetch(`${IDENTITY_API}/v1/claim/context/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  return parseResponse<ClaimContextResponse>(response);
}

export async function requestClaimOtp(
  claimToken: string,
  phoneE164: string,
): Promise<ClaimOtpRequestResponse> {
  const response = await fetch(`${IDENTITY_API}/v1/claim/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim_token: claimToken, phone_e164: phoneE164 }),
  });
  return parseResponse<ClaimOtpRequestResponse>(response);
}

export async function verifyClaimOtp(
  claimToken: string,
  phoneE164: string,
  otp: string,
  consentWhatsapp: boolean,
): Promise<ClaimOtpVerifyResponse> {
  const response = await fetch(`${IDENTITY_API}/v1/claim/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claim_token: claimToken,
      phone_e164: phoneE164,
      otp,
      consent_whatsapp: consentWhatsapp,
    }),
  });
  return parseResponse<ClaimOtpVerifyResponse>(response);
}

export function toIndianE164(digits: string): string {
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (digits.startsWith('+')) {
    return digits;
  }
  throw new Error('Enter a valid 10-digit mobile number');
}
