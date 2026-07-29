'use client';

import { useCallback, useEffect, useState } from 'react';

type CheckState = 'loading' | 'ok' | 'down';

type ServiceCheck = {
  id: string;
  label: string;
  url: string;
  state: CheckState;
  detail: string;
  latencyMs: number | null;
};

const POS_API = process.env.NEXT_PUBLIC_POS_API_URL ?? 'http://localhost:3002';
const IDENTITY_API =
  process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:8001';

function healthUrl(baseOrProxy: string, proxyFallback: string): string {
  const base = baseOrProxy.replace(/\/$/, '');
  if (base.startsWith('http') || base.startsWith('/')) {
    return `${base}/health`;
  }
  return proxyFallback;
}

function resolveServiceUrl(
  proxyPath: string,
  localUrl: string,
  envBase?: string,
): string {
  if (envBase) {
    return healthUrl(envBase, proxyPath);
  }
  if (typeof window !== 'undefined') {
    const { port, hostname } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3101') {
      return localUrl;
    }
  }
  return proxyPath;
}

function buildServiceDefs(): Omit<ServiceCheck, 'state' | 'detail' | 'latencyMs'>[] {
  return [
    {
      id: 'pos',
      label: 'POS Integration',
      url: resolveServiceUrl('/api/pos/health', 'http://localhost:3002/health', POS_API),
    },
    {
      id: 'identity',
      label: 'Identity / Claim',
      url: resolveServiceUrl(
        '/api/identity/health',
        'http://localhost:8001/health',
        IDENTITY_API,
      ),
    },
    {
      id: 'margin',
      label: 'Margin Offer',
      url: resolveServiceUrl('/api/margin/health', 'http://localhost:8002/health'),
    },
    {
      id: 'copy',
      label: 'Copy LLM',
      url: resolveServiceUrl('/api/copy/health', 'http://localhost:8004/health'),
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp Dispatch',
      url: resolveServiceUrl('/api/whatsapp/health', 'http://localhost:3003/health'),
    },
    {
      id: 'tenant-auth',
      label: 'Tenant Auth',
      url: resolveServiceUrl('/api/tenant-auth/health', 'http://localhost:3001/health'),
    },
  ];
}

async function probe(url: string): Promise<Pick<ServiceCheck, 'state' | 'detail' | 'latencyMs'>> {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return { state: 'down', detail: `HTTP ${response.status}`, latencyMs };
    }
    let service = 'ok';
    try {
      const body = (await response.json()) as { status?: string; service?: string };
      if (body.service) service = body.service;
      if (body.status && body.status !== 'ok') {
        return { state: 'down', detail: body.status, latencyMs };
      }
    } catch {
      // Non-JSON health is still fine if status was 2xx.
    }
    return { state: 'ok', detail: service, latencyMs };
  } catch (err) {
    return {
      state: 'down',
      detail: err instanceof Error ? err.message : 'unreachable',
      latencyMs: null,
    };
  }
}

function overallLabel(checks: ServiceCheck[]): string {
  if (checks.some((c) => c.state === 'loading')) return 'Checking…';
  if (checks.every((c) => c.state === 'ok')) return 'All systems operational';
  if (checks.every((c) => c.state === 'down')) return 'All checked services down';
  return 'Partial degradation';
}

export default function StatusPage() {
  const [checks, setChecks] = useState<ServiceCheck[]>(() =>
    buildServiceDefs().map((def) => ({
      ...def,
      state: 'loading' as const,
      detail: '…',
      latencyMs: null,
    })),
  );
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const runChecks = useCallback(async () => {
    const defs = buildServiceDefs();
    setChecks(
      defs.map((c) => ({ ...c, state: 'loading' as const, detail: '…', latencyMs: null })),
    );
    const results = await Promise.all(
      defs.map(async (def) => {
        const result = await probe(def.url);
        return { ...def, ...result };
      }),
    );
    setChecks(results);
    setCheckedAt(Date.now());
  }, []);

  useEffect(() => {
    void runChecks();
    const id = window.setInterval(() => {
      void runChecks();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [runChecks]);

  const overall = overallLabel(checks);

  return (
    <main className="status-page">
      <p className="brand">ReclaimAI</p>
      <h1>System status</h1>
      <p className="muted">
        Live checks against demo proxy health routes (
        <code className="status-code">/api/*/health</code>
        ).
      </p>
      <p
        className={
          checks.every((c) => c.state === 'ok')
            ? 'status-overall status-overall--ok'
            : checks.some((c) => c.state === 'loading')
              ? 'status-overall'
              : 'status-overall status-overall--bad'
        }
      >
        {overall}
      </p>
      <ul className="status-list" aria-live="polite">
        {checks.map((check) => (
          <li key={check.id} className={`status-row status-row--${check.state}`}>
            <span className="status-dot" aria-hidden="true" />
            <div className="status-meta">
              <strong>{check.label}</strong>
              <span className="muted">
                {check.url}
                {check.latencyMs != null ? ` · ${check.latencyMs}ms` : ''}
              </span>
            </div>
            <span className="status-badge">{check.state === 'loading' ? '…' : check.state}</span>
          </li>
        ))}
      </ul>
      <div className="demo-cta">
        <button type="button" className="rai-btn rai-btn--primary" onClick={() => void runChecks()}>
          Refresh
        </button>
        <a className="status-link" href="/">
          Back to demo
        </a>
      </div>
      {checkedAt != null ? (
        <p className="muted status-checked">
          Last checked {new Date(checkedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </main>
  );
}
