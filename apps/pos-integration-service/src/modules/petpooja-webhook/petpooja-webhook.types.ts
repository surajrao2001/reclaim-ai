import type { Aggregator, OrderCreatedPayload, OrderItem } from '@reclaimai/shared-types';

export interface PetpoojaOrderWebhook {
  app_key: string;
  restID: string;
  OrderInfo: {
    Order: {
      orderID: string;
      order_type: string;
      order_from: string;
      total_amount: string;
      discount_amount: string;
      preorder_date: string;
    };
    Customer: {
      name: string;
      phone: string;
      address: string;
    };
    OrderItem: Array<{
      id: string;
      name: string;
      quantity: string;
      price: string;
    }>;
  };
}

export interface ReclaimPrintPayload {
  status: 'success';
  message: string;
  reclaim_print_payload: {
    print_sticker: boolean;
    qr_code_url: string;
    sticker_line_1: string;
    sticker_line_2: string;
  };
}

const AGGREGATOR_MAP: Record<string, Aggregator> = {
  zomato: 'zomato',
  swiggy: 'swiggy',
  direct: 'direct',
  ondc: 'ondc',
};

export function mapAggregator(orderFrom: string): Aggregator {
  const key = orderFrom.trim().toLowerCase();
  return AGGREGATOR_MAP[key] ?? 'direct';
}

export function mapOrderItems(
  items: PetpoojaOrderWebhook['OrderInfo']['OrderItem'],
): OrderItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity),
    price: Number(item.price),
  }));
}

export function buildClaimToken(restId: string, orderId: string): string {
  return Buffer.from(`${restId}:${orderId}`).toString('base64url');
}

export function buildPrintPayload(
  claimQrUrl: string,
  cashbackAmountInr: string,
): ReclaimPrintPayload {
  return {
    status: 'success',
    message: 'Order ingested successfully',
    reclaim_print_payload: {
      print_sticker: true,
      qr_code_url: claimQrUrl,
      sticker_line_1: `Claim ₹${cashbackAmountInr} Instant UPI Cashback`,
      sticker_line_2: 'Scan bill on WhatsApp to unlock',
    },
  };
}

export function toOrderCreatedPayload(
  body: PetpoojaOrderWebhook,
  claimQrUrl: string,
): OrderCreatedPayload {
  const order = body.OrderInfo.Order;
  const orderedAt = new Date(order.preorder_date.replace(' ', 'T') + '+05:30');

  return {
    petpooja_order_id: order.orderID,
    aggregator: mapAggregator(order.order_from),
    masked_customer_ref: body.OrderInfo.Customer.phone || null,
    order_items: mapOrderItems(body.OrderInfo.OrderItem),
    gross_amount: Number(order.total_amount),
    food_cost: null,
    ordered_at: Number.isNaN(orderedAt.getTime())
      ? new Date().toISOString()
      : orderedAt.toISOString(),
    claim_qr_url: claimQrUrl,
  };
}

export function assertPetpoojaOrderWebhook(body: unknown): PetpoojaOrderWebhook {
  if (!body || typeof body !== 'object') {
    throw new Error('INVALID_BODY');
  }

  const candidate = body as PetpoojaOrderWebhook;
  if (
    typeof candidate.restID !== 'string' ||
    !candidate.OrderInfo?.Order?.orderID ||
    !Array.isArray(candidate.OrderInfo.OrderItem)
  ) {
    throw new Error('INVALID_BODY');
  }

  return candidate;
}
