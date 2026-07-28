'use client';

import { useEffect, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import type { DashboardSummaryResponse, StaffMeResponse } from '@reclaimai/shared-types';
import {
  getAuth0AccessToken,
  handleAuth0Redirect,
  hasAuth0RedirectParams,
  isAuth0Configured,
  loginWithAuth0,
  logoutAuth0,
} from '@/lib/auth0';
import {
  clearStoredToken,
  fetchMe,
  fetchSummary,
  getStoredToken,
  getStoredTokenMode,
  isDevBypassEnabled,
  requestDevToken,
  storeToken,
} from '@/lib/tenant-auth-api';

type View = 'loading' | 'login' | 'dashboard' | 'error';

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function DashboardApp() {
  const [view, setView] = useState<View>('loading');
  const [me, setMe] = useState<StaffMeResponse | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadWithToken(token: string) {
    const profile = await fetchMe(token);
    const stats = await fetchSummary(token, profile.tenant_id, 7);
    setMe(profile);
    setSummary(stats);
    setView('dashboard');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        if (isAuth0Configured()) {
          const auth0Token = hasAuth0RedirectParams()
            ? await handleAuth0Redirect()
            : await getAuth0AccessToken();
          if (auth0Token) {
            storeToken(auth0Token, 'auth0');
            if (!cancelled) {
              await loadWithToken(auth0Token);
            }
            return;
          }
        }

        const token = getStoredToken();
        if (!token) {
          if (!cancelled) setView('login');
          return;
        }
        await loadWithToken(token);
      } catch (err) {
        clearStoredToken();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Login failed');
          setView('login');
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuth0Login() {
    setError('');
    setBusy(true);
    try {
      await loginWithAuth0();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Auth0 login failed');
      setView('login');
    }
  }

  async function handleDevLogin() {
    setError('');
    setBusy(true);
    try {
      const token = await requestDevToken();
      await loadWithToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setView('login');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    const mode = getStoredTokenMode();
    clearStoredToken();
    setMe(null);
    setSummary(null);
    if (mode === 'auth0' && isAuth0Configured()) {
      await logoutAuth0();
      return;
    }
    setView('login');
  }

  if (view === 'loading') {
    return <p className="muted">Loading…</p>;
  }

  if (view === 'login') {
    const showAuth0 = isAuth0Configured();
    const showBypass = isDevBypassEnabled();
    return (
      <div className="login">
        <p className="brand">ReclaimAI</p>
        <h1>Owner Dashboard</h1>
        <p className="lede">
          Monitor unmask rates, offers sent, and cashback paid for your kitchen.
        </p>
        {showAuth0 ? (
          <Button type="button" onClick={handleAuth0Login} disabled={busy}>
            Sign in with Auth0
          </Button>
        ) : null}
        {showBypass ? (
          <div className={showAuth0 ? 'login-secondary' : undefined}>
            <Button type="button" onClick={handleDevLogin} disabled={busy}>
              Continue as Demo Owner
            </Button>
          </div>
        ) : null}
        {!showAuth0 && !showBypass ? (
          <p className="muted">
            Set NEXT_PUBLIC_AUTH0_* env vars (or enable NEXT_PUBLIC_AUTH_DEV_BYPASS for local
            only).
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <p className="brand">ReclaimAI</p>
          <h1>{me?.tenant_name ?? 'Dashboard'}</h1>
          <p className="muted">
            {me?.email} · {me?.role}
            {me?.auth_mode === 'dev_bypass' ? ' · dev bypass' : ''}
            {me?.auth_mode === 'auth0' ? ' · Auth0' : ''}
          </p>
        </div>
        <Button type="button" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      {summary ? (
        <section className="kpi-grid" aria-label="Last 7 days">
          <article className="kpi">
            <p className="kpi-label">Orders</p>
            <p className="kpi-value">{summary.orders_count}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Claims</p>
            <p className="kpi-value">{summary.claims_count}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Unmask rate</p>
            <p className="kpi-value">{pct(summary.unmask_rate)}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Offers sent</p>
            <p className="kpi-value">{summary.offers_sent}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Cashback paid</p>
            <p className="kpi-value">{summary.cashback_paid_count}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Cashback ₹</p>
            <p className="kpi-value">{summary.cashback_paid_inr.toFixed(0)}</p>
          </article>
        </section>
      ) : null}

      {summary ? (
        <p className="muted foot">
          Last {summary.window_days} days · Gross orders ₹
          {summary.gross_order_amount_inr.toFixed(0)}
        </p>
      ) : null}
    </div>
  );
}
