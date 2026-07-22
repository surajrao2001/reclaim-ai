import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
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

export function assertRole(claims: StaffJwtClaims, allowed: StaffRole[]): void {
  if (!allowed.includes(claims.role)) {
    throw new Error(`Role ${claims.role} is not permitted for this operation`);
  }
}
