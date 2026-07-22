'use client';

import { useEffect, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import type { ClaimContextResponse } from '@reclaimai/shared-types';
import {
  fetchClaimContext,
  requestClaimOtp,
  toIndianE164,
  verifyClaimOtp,
} from '@/lib/identity-api';

type Step = 'loading' | 'phone' | 'otp' | 'success' | 'error';

interface ClaimFlowProps {
  token: string;
}

export function ClaimFlow({ token }: ClaimFlowProps) {
  const [step, setStep] = useState<Step>('loading');
  const [context, setContext] = useState<ClaimContextResponse | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [otp, setOtp] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClaimContext(token)
      .then((ctx) => {
        setContext(ctx);
        if (ctx.already_claimed) {
          setMessage('This bill was already claimed.');
          setStep('success');
        } else {
          setStep('phone');
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        setStep('error');
      });
  }, [token]);

  async function handleRequestOtp() {
    setError('');
    try {
      const e164 = toIndianE164(phone);
      setPhoneE164(e164);
      await requestClaimOtp(token, e164);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    }
  }

  async function handleVerifyOtp() {
    setError('');
    try {
      const result = await verifyClaimOtp(token, phoneE164, otp, consent);
      setMessage(result.message);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    }
  }

  if (step === 'loading') {
    return <p className="muted">Loading your bill…</p>;
  }

  if (step === 'error') {
    return <p className="error">{error || 'Unable to load claim'}</p>;
  }

  if (step === 'success') {
    return (
      <div>
        <h1>All set</h1>
        <p className="muted">{message}</p>
      </div>
    );
  }

  return (
    <div className="claim-flow">
      {context ? (
        <div className="summary">
          <p className="brand">{context.tenant_name}</p>
          <p>
            Order total: <strong>₹{context.gross_amount.toFixed(0)}</strong>
          </p>
          <p>
            Cashback: <strong>₹{context.cashback_amount_inr}</strong>
          </p>
        </div>
      ) : null}

      {step === 'phone' ? (
        <div className="form-block">
          <label htmlFor="phone">Mobile number</label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I agree to receive WhatsApp updates from this restaurant (DPDP consent)
          </label>
          <Button type="button" onClick={handleRequestOtp} disabled={!phone || !consent}>
            Send OTP
          </Button>
        </div>
      ) : null}

      {step === 'otp' ? (
        <div className="form-block">
          <label htmlFor="otp">Enter OTP sent to {phoneE164}</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <Button type="button" onClick={handleVerifyOtp} disabled={otp.length < 4}>
            Verify & claim
          </Button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
