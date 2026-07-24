import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createOidcVerifier, verifyDevStaffToken } from '@reclaimai/shared-auth';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { apiError } from '../../common/api-error';
import { DatabaseService, type StaffRow } from '../database/database.service';
import { HttpStatus } from '@nestjs/common';

export type AuthMode = 'auth0' | 'dev_bypass';

export interface AuthenticatedRequest extends Request {
  staff?: StaffRow;
  authMode?: AuthMode;
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.toLowerCase().startsWith('bearer ')) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Bearer token required');
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Bearer token required');
    }

    let sub: string;
    let email: string | undefined;
    let authMode: AuthMode;

    if (this.config.authDevBypass) {
      try {
        const claims = await verifyDevStaffToken(token, this.config.authDevSecret);
        sub = claims.sub;
        email = claims.email;
        authMode = 'dev_bypass';
      } catch {
        if (!this.config.auth0Domain) {
          throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid access token');
        }
        const oidc = await this.verifyAuth0(token);
        sub = oidc.sub;
        email = oidc.email;
        authMode = 'auth0';
      }
    } else {
      const oidc = await this.verifyAuth0(token);
      sub = oidc.sub;
      email = oidc.email;
      authMode = 'auth0';
    }

    let staff = await this.db.findStaffByAuth0Sub(sub);
    if (!staff && email) {
      staff = await this.db.findStaffByEmail(email);
      if (staff && !staff.auth0_sub) {
        await this.db.linkAuth0Sub(staff.id, sub);
        staff = { ...staff, auth0_sub: sub };
      }
    }

    if (!staff) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'STAFF_NOT_PROVISIONED',
        'No staff user is provisioned for this login',
      );
    }

    req.staff = staff;
    req.authMode = authMode;
    return true;
  }

  private async verifyAuth0(token: string): Promise<{ sub: string; email?: string }> {
    if (!this.config.auth0Domain || !this.config.auth0JwksUrl) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Auth0 is not configured',
      );
    }
    try {
      const verify = createOidcVerifier({
        issuer: this.config.auth0Issuer,
        audience: this.config.auth0Audience,
        jwksUrl: this.config.auth0JwksUrl,
      });
      const claims = await verify(token);
      return { sub: claims.sub, email: claims.email };
    } catch {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid access token');
    }
  }
}
