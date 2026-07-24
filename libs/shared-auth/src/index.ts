import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { StaffRole } from '@reclaimai/shared-types';

export interface StaffJwtClaims extends JWTPayload {
  sub: string;
  tenant_id: string;
  role: StaffRole;
  email?: string;
}

export interface ClaimJwtClaims extends JWTPayload {
  sub: string;
  claim_id: string;
  aggregator_order_id: string;
  scope: 'cashback_claim';
}

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

/** Auth0/OIDC access token — does not require tenant_id/role (resolved from DB). */
export interface OidcTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
}

export function createJwksVerifier(options: JwtVerifierOptions) {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl));

  return async function verifyAccessToken(token: string): Promise<StaffJwtClaims> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
    });

    const tenantId = payload.tenant_id;
    const role = payload.role;

    if (typeof tenantId !== 'string' || typeof role !== 'string') {
      throw new Error('JWT missing required tenant_id or role claims');
    }

    return payload as StaffJwtClaims;
  };
}

/** Verify Auth0 access token; tenant/role come from staff_users afterwards. */
export function createOidcVerifier(options: JwtVerifierOptions) {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl));

  return async function verifyOidcAccessToken(token: string): Promise<OidcTokenClaims> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
    });

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('OIDC token missing sub');
    }

    const email =
      typeof payload.email === 'string'
        ? payload.email
        : typeof payload[`${options.audience}/email`] === 'string'
          ? (payload[`${options.audience}/email`] as string)
          : undefined;

    return { ...payload, sub: payload.sub, email } as OidcTokenClaims;
  };
}

export async function signDevStaffToken(input: {
  secret: string;
  sub: string;
  email: string;
  ttlSeconds?: number;
}): Promise<string> {
  const key = new TextEncoder().encode(input.secret);
  return new SignJWT({
    email: input.email,
    scope: 'staff_dev',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${input.ttlSeconds ?? 60 * 60 * 8}s`)
    .setIssuer('reclaimai-dev')
    .setAudience('reclaimai-dashboard')
    .sign(key);
}

export async function verifyDevStaffToken(
  token: string,
  secret: string,
): Promise<OidcTokenClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    issuer: 'reclaimai-dev',
    audience: 'reclaimai-dashboard',
    algorithms: ['HS256'],
  });
  if (typeof payload.sub !== 'string') {
    throw new Error('Dev token missing sub');
  }
  return {
    ...payload,
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  } as OidcTokenClaims;
}

export function assertRole(claims: StaffJwtClaims, allowed: StaffRole[]): void {
  if (!allowed.includes(claims.role)) {
    throw new Error(`Role ${claims.role} is not permitted for this operation`);
  }
}
