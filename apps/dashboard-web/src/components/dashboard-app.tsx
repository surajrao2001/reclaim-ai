'use client';

import { useEffect, useState } from 'react';
import { Button } from '@reclaimai/ui-components';
import type { DashboardSummaryResponse, StaffMeResponse } from '@reclaimai/shared-types';
import {
  clearStoredToken,
  fetchMe,
  fetchSummary,
  getStoredToken,
  isDevBypassEnabled,
  requestDevToken,
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

  async function loadWithToken(token: string) {
    const profile = await fetchMe(token);
    const stats = await fetchSummary(token, profile.tenant_id, 7);
    setMe(profile);
    setSummary(stats);
    setView('dashboard');
  }

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setView('login');
      return;
    }
    loadWithToken(token).catch((err: Error) => {
      clearStoredToken();
      setError(err.message);
      setView('login');
    });
  }, []);

  async function handleDevLogin() {
    setError('');
    try {
      const token = await requestDevToken();
      await loadWithToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setView('login');
    }
  }

  function handleSignOut() {
    clearStoredToken();
    setMe(null);
    setSummary(null);
    setView('login');
  }

  if (view === 'loading') {
    return <p className="muted">Loading…</p>;
  }

  if (view === 'login') {
    return (
      <div className="login">
        <p className="brand">ReclaimAI</p>
        <h1>Owner Dashboard</h1>
        <p className="lede">
          Monitor unmask rates, offers sent, and cashback paid for your kitchen.
        </p>
        {isDevBypassEnabled() ? (
          <Button type="button" onClick={handleDevLogin}>
            Continue as Demo Owner
          </Button>
        ) : (
          <p className="muted">
            Set Auth0 env vars (or enable AUTH_DEV_BYPASS) to sign in.
          </p>
        )}
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
