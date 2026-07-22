import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantPlan } from '@reclaimai/shared-types';

export interface TenantRecord {
  id: string;
  name: string;
  petpooja_restaurant_id: string | null;
  plan: TenantPlan;
  created_at: string;
}

@Injectable()
export class TenantsService {
  // In-memory store for local bootstrap only; replaced by Postgres in next milestone.
  private readonly tenants = new Map<string, TenantRecord>();

  getById(tenantId: string): TenantRecord {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: `Tenant ${tenantId} not found`,
          trace_id: crypto.randomUUID(),
          retryable: false,
        },
      });
    }
    return tenant;
  }

  upsert(tenant: TenantRecord): TenantRecord {
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }
}
