'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import { DemoPipeline } from '@/components/demo-pipeline';
import { simulateOrder } from '@/lib/pos-api';

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

const REDIRECT_DELAY_MS = 4500;

const WHAT_NEXT = [
  { title: 'Order created', detail: 'Simulate Order hit the real POS webhook path and Kafka.' },
  { title: 'Claim this bill', detail: 'You’ll enter a phone number on the next screen.' },
  { title: 'Verify with OTP', detail: 'Confirm ownership via WhatsApp or email OTP.' },
  { title: 'Cashback + offer', detail: 'UPI payout runs while margin copy goes out on WhatsApp.' },
] as const;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export function TryLiveDemoButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const widgetHost = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widgetHost.current) {
      return;
    }

    let cancelled = false;

    function mountWidget() {
      if (cancelled || !widgetHost.current || !window.turnstile || widgetId.current) {
        return;
      }
      widgetId.current = window.turnstile.render(widgetHost.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-reclaim-turnstile]',
    );
    if (window.turnstile) {
      mountWidget();
      return () => {
        cancelled = true;
      };
    }

    const script =
      existing ??
      Object.assign(document.createElement('script'), {
        src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
        async: true,
        defer: true,
      });
    script.dataset.reclaimTurnstile = '1';
    script.addEventListener('load', mountWidget);
    if (!existing) {
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      script.removeEventListener('load', mountWidget);
    };
  }, []);

  useEffect(() => {
    if (!claimUrl) return;

    const endsAt = Date.now() + REDIRECT_DELAY_MS;
    setSecondsLeft(Math.ceil(REDIRECT_DELAY_MS / 1000));

    const tickId = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 250);

    const redirectId = window.setTimeout(() => {
      window.location.assign(claimUrl);
    }, REDIRECT_DELAY_MS);

    return () => {
      window.clearInterval(tickId);
      window.clearTimeout(redirectId);
    };
  }, [claimUrl]);

  async function handleClick() {
    setError('');
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Complete the security check before starting the demo');
      return;
    }
    setLoading(true);
    try {
      const result = await simulateOrder(
        TURNSTILE_SITE_KEY ? turnstileToken : undefined,
      );
      setClaimUrl(result.claim_url);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start demo');
      setLoading(false);
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
      }
    }
  }

  function continueNow() {
    if (claimUrl) {
      window.location.assign(claimUrl);
    }
  }

  if (claimUrl) {
    return (
      <section className="demo-success" aria-live="polite">
        <p className="demo-success-kicker">Order simulated</p>
        <h2 className="demo-success-title">What happens next</h2>
        <DemoPipeline highlightIndex={0} />
        <ol className="demo-timeline">
          {WHAT_NEXT.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
        <div className="demo-cta">
          <Button variant="primary" onClick={continueNow}>
            Continue to claim
          </Button>
          <p className="muted demo-redirect-hint">
            Redirecting in {secondsLeft}s…
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="demo-cta">
      {TURNSTILE_SITE_KEY ? (
        <div ref={widgetHost} className="turnstile-host" aria-label="Security check" />
      ) : null}
      <Button variant="primary" onClick={handleClick} disabled={loading}>
        {loading ? 'Starting demo…' : 'Try live demo'}
      </Button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
