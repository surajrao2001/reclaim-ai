import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

export interface TenantRow {
  id: string;
  name: string;
  petpooja_restaurant_id: string;
  plan: string;
}

export interface AggregatorOrderInsert {
  tenantId: string;
  petpoojaOrderId: string;
  aggregator: string;
  maskedCustomerRef: string | null;
  orderItems: unknown;
  grossAmount: number;
  orderedAt: Date;
}

export interface AggregatorOrderRow {
  id: string;
  tenant_id: string;
  petpooja_order_id: string;
  inserted: boolean;
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

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findTenantByPetpoojaRestaurantId(
    petpoojaRestaurantId: string,
  ): Promise<TenantRow | null> {
    const { rows } = await this.query<TenantRow>(
      `SELECT id, name, petpooja_restaurant_id, plan
       FROM tenancy.tenants
       WHERE petpooja_restaurant_id = $1
       LIMIT 1`,
      [petpoojaRestaurantId],
    );
    return rows[0] ?? null;
  }

  async insertAggregatorOrderIdempotent(
    input: AggregatorOrderInsert,
  ): Promise<AggregatorOrderRow> {
    const insertResult = await this.query<{
      id: string;
      tenant_id: string;
      petpooja_order_id: string;
    }>(
      `INSERT INTO commerce.aggregator_orders (
          tenant_id,
          petpooja_order_id,
          aggregator,
          masked_customer_ref,
          order_items,
          gross_amount,
          ordered_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        ON CONFLICT (tenant_id, petpooja_order_id) DO NOTHING
        RETURNING id, tenant_id, petpooja_order_id`,
      [
        input.tenantId,
        input.petpoojaOrderId,
        input.aggregator,
        input.maskedCustomerRef,
        JSON.stringify(input.orderItems),
        input.grossAmount,
        input.orderedAt.toISOString(),
      ],
    );

    if (insertResult.rows[0]) {
      return { ...insertResult.rows[0], inserted: true };
    }

    const existing = await this.query<{
      id: string;
      tenant_id: string;
      petpooja_order_id: string;
    }>(
      `SELECT id, tenant_id, petpooja_order_id
       FROM commerce.aggregator_orders
       WHERE tenant_id = $1 AND petpooja_order_id = $2
       LIMIT 1`,
      [input.tenantId, input.petpoojaOrderId],
    );

    const row = existing.rows[0];
    if (!row) {
      throw new Error('Order upsert failed: conflict without existing row');
    }

    return { ...row, inserted: false };
  }
}
