import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { signDevStaffToken } from '@reclaimai/shared-auth';
import type { StaffMeResponse } from '@reclaimai/shared-types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { apiError } from '../../common/api-error';
import { HttpStatus } from '@nestjs/common';
import { StaffAuthGuard, type AuthenticatedRequest } from './staff-auth.guard';

@Controller('v1')
export class AuthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Post('auth/dev-token')
  async issueDevToken(): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    // authDevBypass is forced false when NODE_ENV=production (see loadConfig).
    if (!this.config.authDevBypass || this.config.environment === 'production') {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'DEV_BYPASS_DISABLED',
        'Dev bypass is disabled',
      );
    }

    const expiresIn = 60 * 60 * 8;
    const access_token = await signDevStaffToken({
      secret: this.config.authDevSecret,
      sub: this.config.demoStaffSub,
      email: this.config.demoStaffEmail,
      ttlSeconds: expiresIn,
    });
    return { access_token, token_type: 'Bearer', expires_in: expiresIn };
  }

  @Get('me')
  @UseGuards(StaffAuthGuard)
  me(@Req() req: AuthenticatedRequest): StaffMeResponse {
    const staff = req.staff!;
    return {
      staff_id: staff.id,
      email: staff.email,
      role: staff.role,
      tenant_id: staff.tenant_id,
      tenant_name: staff.tenant_name,
      auth_mode: req.authMode ?? 'dev_bypass',
    };
  }
}
