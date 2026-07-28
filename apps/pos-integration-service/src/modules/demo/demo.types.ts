import type { PetpoojaOrderWebhook } from '../petpooja-webhook/petpooja-webhook.types';

export const SHOWCASE_REST_ID_DEFAULT = 'pp_out_88219';

export interface SimulateOrderResponse {
  order_id: string;
  claim_url: string;
  qr_code_url: string;
  status: 'success';
  message: string;
  reclaim_print_payload: {
    print_sticker: boolean;
    qr_code_url: string;
    sticker_line_1: string;
    sticker_line_2: string;
  };
}

export function buildShowcasePetpoojaPayload(
  restId: string,
  orderId: string,
  now = new Date(),
): PetpoojaOrderWebhook {
  const pad = (n: number) => String(n).padStart(2, '0');
  const preorderDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return {
    app_key: 'reclaim_demo_simulate',
    restID: restId,
    OrderInfo: {
      Order: {
        orderID: orderId,
        order_type: 'Delivery',
        order_from: 'Zomato',
        total_amount: '550.00',
        discount_amount: '50.00',
        preorder_date: preorderDate,
      },
      Customer: {
        name: 'Demo Visitor',
        phone: '9900000000',
        address: 'Masked Address Portfolio Demo',
      },
      OrderItem: [
        {
          id: 'item_101',
          name: 'Chicken Dum Biryani',
          quantity: '1',
          price: '350.00',
        },
        {
          id: 'item_102',
          name: 'Garlic Naan',
          quantity: '2',
          price: '100.00',
        },
      ],
    },
  };
}

export function newDemoOrderId(): string {
  const stamp = Date.now();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `DEMO_${stamp}_${suffix}`;
}

export function clientIpFromRequest(headers: Record<string, string | string[] | undefined>, fallback = 'unknown'): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]!.trim();
  }
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }
  return fallback;
}
