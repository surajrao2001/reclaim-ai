import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import type { StaffRole, TenantPlan } from '@reclaimai/shared-types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

export interface TenantRow {
  id: string;
  name: string;
  petpooja_restaurant_id: string | null;
  plan: TenantPlan;
  created_at: Date;
}

export interface StaffRow {
  id: string;
  tenant_id: string;
  email: string;
  role: StaffRole;
  auth0_sub: string | null;
  tenant_name: string;
}

export interface DashboardSummaryRow {
  orders_count: number;
  claims_count: number;
  offers_sent: number;
  cashback_paid_count: number;
  cashback_paid_inr: number;
  gross_order_amount_inr: number;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const result = await this.pool.query<T>(text, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  async findTenantById(tenantId: string): Promise<TenantRow | null> {
    const { rows } = await this.query<TenantRow>(
      `SELECT id, name, petpooja_restaurant_id, plan, created_at
       FROM tenancy.tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async findStaffByAuth0Sub(auth0Sub: string): Promise<StaffRow | null> {
    const { rows } = await this.query<StaffRow>(
      `SELECT s.id, s.tenant_id, s.email, s.role, s.auth0_sub, t.name AS tenant_name
       FROM tenancy.staff_users s
       JOIN tenancy.tenants t ON t.id = s.tenant_id
       WHERE s.auth0_sub = $1
       LIMIT 1`,
      [auth0Sub],
    );
    return rows[0] ?? null;
  }

  async findStaffByEmail(email: string): Promise<StaffRow | null> {
    const { rows } = await this.query<StaffRow>(
      `SELECT s.id, s.tenant_id, s.email, s.role, s.auth0_sub, t.name AS tenant_name
       FROM tenancy.staff_users s
       JOIN tenancy.tenants t ON t.id = s.tenant_id
       WHERE lower(s.email) = lower($1)
       LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async linkAuth0Sub(staffId: string, auth0Sub: string): Promise<void> {
    await this.query(
      `UPDATE tenancy.staff_users
       SET auth0_sub = $2
       WHERE id = $1 AND (auth0_sub IS NULL OR auth0_sub = $2)`,
      [staffId, auth0Sub],
    );
  }

  async getDashboardSummary(
    tenantId: string,
    windowDays: number,
  ): Promise<DashboardSummaryRow> {
    const { rows } = await this.query<{
      orders_count: string;
      claims_count: string;
      offers_sent: string;
      cashback_paid_count: string;
      cashback_paid_inr: string;
      gross_order_amount_inr: string;
    }>(
      `SELECT
          (SELECT COUNT(*)::int
             FROM commerce.aggregator_orders ao
            WHERE ao.tenant_id = $1
              AND ao.ordered_at >= now() - ($2 || ' days')::interval
          ) AS orders_count,
          (SELECT COUNT(*)::int
             FROM identity.identity_claims ic
             JOIN commerce.aggregator_orders ao ON ao.id = ic.aggregator_order_id
            WHERE ao.tenant_id = $1
              AND ic.created_at >= now() - ($2 || ' days')::interval
          ) AS claims_count,
          (SELECT COUNT(*)::int
             FROM offers.offers o
            WHERE o.tenant_id = $1
              AND o.status = 'sent'
              AND o.created_at >= now() - ($2 || ' days')::interval
          ) AS offers_sent,
          (SELECT COUNT(*)::int
             FROM identity.identity_claims ic
             JOIN commerce.aggregator_orders ao ON ao.id = ic.aggregator_order_id
            WHERE ao.tenant_id = $1
              AND ic.payout_status = 'paid'
              AND ic.payout_updated_at >= now() - ($2 || ' days')::interval
          ) AS cashback_paid_count,
          (SELECT COALESCE(SUM(ic.cashback_amount), 0)::float8
             FROM identity.identity_claims ic
             JOIN commerce.aggregator_orders ao ON ao.id = ic.aggregator_order_id
            WHERE ao.tenant_id = $1
              AND ic.payout_status = 'paid'
              AND ic.payout_updated_at >= now() - ($2 || ' days')::interval
          ) AS cashback_paid_inr,
          (SELECT COALESCE(SUM(ao.gross_amount), 0)::float8
             FROM commerce.aggregator_orders ao
            WHERE ao.tenant_id = $1
              AND ao.ordered_at >= now() - ($2 || ' days')::interval
          ) AS gross_order_amount_inr`,
      [tenantId, String(windowDays)],
    );

    const row = rows[0];
    return {
      orders_count: Number(row?.orders_count ?? 0),
      claims_count: Number(row?.claims_count ?? 0),
      offers_sent: Number(row?.offers_sent ?? 0),
      cashback_paid_count: Number(row?.cashback_paid_count ?? 0),
      cashback_paid_inr: Number(row?.cashback_paid_inr ?? 0),
      gross_order_amount_inr: Number(row?.gross_order_amount_inr ?? 0),
    };
  }
}
