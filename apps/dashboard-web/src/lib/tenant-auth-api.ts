import type {
  ApiErrorBody,
  DashboardSummaryResponse,
  StaffMeResponse,
} from '@reclaimai/shared-types';

const TENANT_AUTH =
  process.env.NEXT_PUBLIC_TENANT_AUTH_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'reclaim_staff_access_token';

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const err = body as ApiErrorBody;
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return body as T;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function isDevBypassEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS ?? 'true') === 'true';
}

export async function requestDevToken(): Promise<string> {
  const response = await fetch(`${TENANT_AUTH}/v1/auth/dev-token`, {
    method: 'POST',
  });
  const body = await parseResponse<{ access_token: string }>(response);
  storeToken(body.access_token);
  return body.access_token;
}

export async function fetchMe(token: string): Promise<StaffMeResponse> {
  const response = await fetch(`${TENANT_AUTH}/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return parseResponse<StaffMeResponse>(response);
}

export async function fetchSummary(
  token: string,
  tenantId: string,
  windowDays = 7,
): Promise<DashboardSummaryResponse> {
  const response = await fetch(
    `${TENANT_AUTH}/v1/tenants/${encodeURIComponent(tenantId)}/dashboard/summary?window_days=${windowDays}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  return parseResponse<DashboardSummaryResponse>(response);
}
