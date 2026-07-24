import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { DashboardSummaryResponse } from '@reclaimai/shared-types';
import { apiError } from '../../common/api-error';
import {
  StaffAuthGuard,
  type AuthenticatedRequest,
} from '../auth/staff-auth.guard';
import { DatabaseService } from '../database/database.service';

@Controller('v1/tenants')
@UseGuards(StaffAuthGuard)
export class TenantsController {
  constructor(private readonly db: DatabaseService) {}

  @Get(':tenantId')
  async getTenant(
    @Param('tenantId') tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertSameTenant(req, tenantId);
    const tenant = await this.db.findTenantById(tenantId);
    if (!tenant) {
      throw apiError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Tenant not found');
    }
    return {
      id: tenant.id,
      name: tenant.name,
      petpooja_restaurant_id: tenant.petpooja_restaurant_id,
      plan: tenant.plan,
      created_at: tenant.created_at.toISOString(),
    };
  }

  @Get(':tenantId/dashboard/summary')
  async getSummary(
    @Param('tenantId') tenantId: string,
    @Query('window_days') windowDaysRaw: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<DashboardSummaryResponse> {
    this.assertSameTenant(req, tenantId);
    const tenant = await this.db.findTenantById(tenantId);
    if (!tenant) {
      throw apiError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Tenant not found');
    }

    const windowDays = Math.min(
      90,
      Math.max(1, Number(windowDaysRaw ?? 7) || 7),
    );
    const stats = await this.db.getDashboardSummary(tenantId, windowDays);
    const unmaskRate =
      stats.orders_count === 0 ? 0 : stats.claims_count / stats.orders_count;

    return {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      window_days: windowDays,
      orders_count: stats.orders_count,
      claims_count: stats.claims_count,
      unmask_rate: Number(unmaskRate.toFixed(4)),
      offers_sent: stats.offers_sent,
      cashback_paid_count: stats.cashback_paid_count,
      cashback_paid_inr: stats.cashback_paid_inr,
      gross_order_amount_inr: stats.gross_order_amount_inr,
    };
  }

  private assertSameTenant(req: AuthenticatedRequest, tenantId: string): void {
    if (req.staff?.tenant_id !== tenantId) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'TENANT_FORBIDDEN',
        'You cannot access another tenant',
      );
    }
  }
}
