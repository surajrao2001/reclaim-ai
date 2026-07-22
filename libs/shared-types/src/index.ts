export type StaffRole = 'owner' | 'manager' | 'staff';

export type TenantPlan = 'starter' | 'growth' | 'enterprise';

export type Aggregator = 'zomato' | 'swiggy' | 'direct' | 'ondc';

export type OfferStatus = 'pending' | 'sent' | 'clicked' | 'converted' | 'expired';

export type WhatsAppDeliveryChannel = 'meta_cloud_api' | 'gupshup_bsp';

export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type DirectOrderChannel = 'direct_link' | 'ondc';

export type ReclaimEventType =
  | 'reclaimai.order.created.v1'
  | 'reclaimai.identity.unmasked.v1'
  | 'reclaimai.offer.ready.v1'
  | 'reclaimai.message.generated.v1'
  | 'reclaimai.whatsapp.delivered.v1'
  | 'reclaimai.direct_order.completed.v1';

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  event_type: ReclaimEventType;
  tenant_id: string;
  trace_id?: string;
  occurred_at: string;
  payload: TPayload;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface OrderCreatedPayload {
  petpooja_order_id: string;
  aggregator: Aggregator;
  masked_customer_ref?: string | null;
  order_items: OrderItem[];
  gross_amount: number;
  food_cost?: number | null;
  ordered_at: string;
  claim_qr_url: string;
}

export interface IdentityUnmaskedPayload {
  customer_id: string;
  aggregator_order_id: string;
  consent_whatsapp: boolean;
  phone_e164_hash?: string;
}

export interface OfferReadyPayload {
  offer_id: string;
  customer_id: string;
  max_margin_safe_discount_pct: number;
  max_discount_rupees: number;
  scheduled_for: string;
  favorite_dish_name: string;
  decay_score?: number | null;
  direct_order_url?: string;
}

export interface MessageGeneratedPayload {
  offer_id: string;
  message_body: string;
  selected_discount_value: number;
  llm_model_used: string;
  prompt_version: string;
  cta_url?: string;
}

export interface WhatsappDeliveredPayload {
  offer_id: string;
  wa_message_id: string;
  delivery_channel: WhatsAppDeliveryChannel;
  status: WhatsAppMessageStatus;
}

export interface DirectOrderCompletedPayload {
  direct_order_id: string;
  customer_id: string;
  offer_id?: string | null;
  channel: DirectOrderChannel;
  amount: number;
  commission_saved: number;
  ordered_at?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    trace_id: string;
    retryable: boolean;
  };
}

export const KAFKA_TOPICS = {
  ORDER_CREATED: 'reclaimai.order.created.v1',
  IDENTITY_UNMASKED: 'reclaimai.identity.unmasked.v1',
  OFFER_READY: 'reclaimai.offer.ready.v1',
  MESSAGE_GENERATED: 'reclaimai.message.generated.v1',
  WHATSAPP_DELIVERED: 'reclaimai.whatsapp.delivered.v1',
  DIRECT_ORDER_COMPLETED: 'reclaimai.direct_order.completed.v1',
} as const satisfies Record<string, ReclaimEventType>;
