/** Digits-only MSISDN for Meta / Gupshup (no leading +). */
export function toWhatsAppDigits(phoneE164: string): string {
  return phoneE164.replace(/\D/g, '');
}

/** Mask for logs: keep last 4 digits. */
export function maskPhone(phoneE164: string): string {
  const digits = toWhatsAppDigits(phoneE164);
  if (digits.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
