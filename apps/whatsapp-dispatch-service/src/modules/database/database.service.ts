import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import type {
  WhatsAppDeliveryChannel,
  WhatsAppMessageStatus,
} from '@reclaimai/shared-types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

export interface OfferDispatchRow {
  offer_id: string;
  tenant_id: string;
  customer_id: string;
  offer_status: string;
  phone_number: string;
  consent_whatsapp: boolean;
}

export interface WhatsappMessageRow {
  id: string;
  offer_id: string;
  wa_message_id: string | null;
  delivery_channel: WhatsAppDeliveryChannel;
  status: WhatsAppMessageStatus;
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

  async findOfferForDispatch(offerId: string): Promise<OfferDispatchRow | null> {
    const { rows } = await this.query<{
      offer_id: string;
      tenant_id: string;
      customer_id: string;
      offer_status: string;
      phone_number: string;
      consent_whatsapp: boolean;
    }>(
      `SELECT
          o.id AS offer_id,
          o.tenant_id,
          o.customer_id,
          o.status AS offer_status,
          c.phone_number,
          c.consent_whatsapp
       FROM offers.offers o
       JOIN identity.customers c ON c.id = o.customer_id
       WHERE o.id = $1
       LIMIT 1`,
      [offerId],
    );
    return rows[0] ?? null;
  }

  async findWhatsappMessageByOfferId(
    offerId: string,
  ): Promise<WhatsappMessageRow | null> {
    const { rows } = await this.query<WhatsappMessageRow>(
      `SELECT id, offer_id, wa_message_id, delivery_channel, status
       FROM offers.whatsapp_messages
       WHERE offer_id = $1
       LIMIT 1`,
      [offerId],
    );
    return rows[0] ?? null;
  }

  async findWhatsappMessageByWaId(
    waMessageId: string,
  ): Promise<WhatsappMessageRow | null> {
    const { rows } = await this.query<WhatsappMessageRow>(
      `SELECT id, offer_id, wa_message_id, delivery_channel, status
       FROM offers.whatsapp_messages
       WHERE wa_message_id = $1
       LIMIT 1`,
      [waMessageId],
    );
    return rows[0] ?? null;
  }

  async upsertWhatsappMessage(input: {
    offerId: string;
    waMessageId: string | null;
    deliveryChannel: WhatsAppDeliveryChannel;
    status: WhatsAppMessageStatus;
  }): Promise<WhatsappMessageRow> {
    const { rows } = await this.query<WhatsappMessageRow>(
      `INSERT INTO offers.whatsapp_messages (
          offer_id, wa_message_id, delivery_channel, status, updated_at
        ) VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (offer_id) DO UPDATE SET
          wa_message_id = COALESCE(EXCLUDED.wa_message_id, offers.whatsapp_messages.wa_message_id),
          delivery_channel = EXCLUDED.delivery_channel,
          status = EXCLUDED.status,
          updated_at = now()
        RETURNING id, offer_id, wa_message_id, delivery_channel, status`,
      [
        input.offerId,
        input.waMessageId,
        input.deliveryChannel,
        input.status,
      ],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('whatsapp_messages upsert returned no row');
    }
    return row;
  }

  async updateWhatsappStatusByWaId(
    waMessageId: string,
    status: WhatsAppMessageStatus,
  ): Promise<WhatsappMessageRow | null> {
    const { rows } = await this.query<WhatsappMessageRow>(
      `UPDATE offers.whatsapp_messages
       SET status = $2, updated_at = now()
       WHERE wa_message_id = $1
       RETURNING id, offer_id, wa_message_id, delivery_channel, status`,
      [waMessageId, status],
    );
    return rows[0] ?? null;
  }

  async markOfferSent(offerId: string): Promise<void> {
    await this.query(
      `UPDATE offers.offers
       SET status = 'sent'
       WHERE id = $1 AND status = 'pending'`,
      [offerId],
    );
  }
}
