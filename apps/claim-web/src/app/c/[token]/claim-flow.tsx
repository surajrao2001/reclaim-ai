'use client';

import { useEffect, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import type { ClaimContextResponse } from '@reclaimai/shared-types';
import {
  claimCashback,
  fetchClaimContext,
  requestClaimOtp,
  toIndianE164,
  verifyClaimOtp,
} from '@/lib/identity-api';

type Step = 'loading' | 'phone' | 'otp' | 'upi' | 'success' | 'error';

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
  const [claimJwt, setClaimJwt] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClaimContext(token)
      .then((ctx) => {
        setContext(ctx);
        if (ctx.already_claimed && ctx.payout_status === 'paid') {
          setMessage('This bill was already claimed and cashback was paid.');
          setStep('success');
        } else if (ctx.already_claimed && ctx.payout_status && ctx.payout_status !== 'failed') {
          setMessage('This bill was already claimed — cashback is still processing.');
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
      setClaimJwt(result.claim_jwt);
      setMessage(result.message);
      if (result.payout_status === 'paid') {
        setStep('success');
      } else if (result.payout_status === 'pending' || result.payout_status === 'processing') {
        setStep('success');
      } else {
        setStep('upi');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    }
  }

  async function handleCashback() {
    setError('');
    try {
      const result = await claimCashback(claimJwt, upiVpa);
      setMessage(result.message);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cashback failed');
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
        {context ? (
          <p className="muted">Cashback: ₹{context.cashback_amount_inr}</p>
        ) : null}
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

      {step === 'upi' ? (
        <div className="form-block">
          <label htmlFor="upi">UPI ID for cashback</label>
          <input
            id="upi"
            type="text"
            inputMode="text"
            placeholder="yourname@upi"
            value={upiVpa}
            onChange={(e) => setUpiVpa(e.target.value)}
            autoComplete="off"
          />
          <Button
            type="button"
            onClick={handleCashback}
            disabled={!upiVpa.includes('@') || !claimJwt}
          >
            Get ₹{context?.cashback_amount_inr ?? ''} cashback
          </Button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
