'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import { simulateOrder } from '@/lib/pos-api';

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

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
      window.location.assign(result.claim_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start demo');
      setLoading(false);
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
      }
    }
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
