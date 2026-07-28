import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

let clientPromise: Promise<Auth0Client> | null = null;

export function isAuth0Configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN &&
      process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID &&
      process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
  );
}

function callbackUrl(): string {
  if (process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL) {
    return process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL;
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:3100';
  }
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}`;
}

export async function getAuth0Client(): Promise<Auth0Client> {
  if (!isAuth0Configured()) {
    throw new Error('Auth0 is not configured');
  }
  if (!clientPromise) {
    clientPromise = createAuth0Client({
      domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
      clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
      authorizationParams: {
        redirect_uri: callbackUrl(),
        audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
        scope: 'openid profile email',
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });
  }
  return clientPromise;
}

export function hasAuth0RedirectParams(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

export async function loginWithAuth0(): Promise<void> {
  const client = await getAuth0Client();
  await client.loginWithRedirect();
}

export async function handleAuth0Redirect(): Promise<string | null> {
  const client = await getAuth0Client();
  if (hasAuth0RedirectParams()) {
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  const authenticated = await client.isAuthenticated();
  if (!authenticated) return null;
  return client.getTokenSilently();
}

export async function getAuth0AccessToken(): Promise<string | null> {
  if (!isAuth0Configured()) return null;
  try {
    const client = await getAuth0Client();
    const authenticated = await client.isAuthenticated();
    if (!authenticated) return null;
    return client.getTokenSilently();
  } catch {
    return null;
  }
}

export async function logoutAuth0(): Promise<void> {
  if (!isAuth0Configured()) return;
  const client = await getAuth0Client();
  const returnTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}`
      : undefined;
  await client.logout({
    logoutParams: { returnTo },
  });
}
