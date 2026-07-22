import { signHmacSha256Hex, verifyHmacSha256Hex } from '../src/common/hmac';
import {
  buildClaimToken,
  buildPrintPayload,
  mapAggregator,
  mapOrderItems,
  toOrderCreatedPayload,
  type PetpoojaOrderWebhook,
} from '../src/modules/petpooja-webhook/petpooja-webhook.types';

describe('hmac', () => {
  it('verifies a matching signature', () => {
    const body = Buffer.from('{"hello":"world"}');
    const secret = 'test-secret';
    const signature = signHmacSha256Hex(body, secret);
    expect(verifyHmacSha256Hex(body, signature, secret)).toBe(true);
  });

  it('rejects a mismatched signature', () => {
    const body = Buffer.from('{"hello":"world"}');
    expect(verifyHmacSha256Hex(body, 'deadbeef', 'test-secret')).toBe(false);
  });
});

describe('petpooja mapping', () => {
  const sample: PetpoojaOrderWebhook = {
    app_key: 'reclaim_prod_993810a831',
    restID: 'pp_out_88219',
    OrderInfo: {
      Order: {
        orderID: 'PET_ZOM_8831092',
        order_type: 'Delivery',
        order_from: 'Zomato',
        total_amount: '550.00',
        discount_amount: '50.00',
        preorder_date: '2026-07-21 20:15:00',
      },
      Customer: {
        name: 'Zomato Customer',
        phone: '9900000000',
        address: 'Masked Address Sector 4',
      },
      OrderItem: [
        { id: 'item_101', name: 'Chicken Dum Biryani', quantity: '1', price: '350.00' },
        { id: 'item_102', name: 'Garlic Naan', quantity: '2', price: '100.00' },
      ],
    },
  };

  it('maps aggregator and items', () => {
    expect(mapAggregator(sample.OrderInfo.Order.order_from)).toBe('zomato');
    expect(mapOrderItems(sample.OrderInfo.OrderItem)).toEqual([
      { id: 'item_101', name: 'Chicken Dum Biryani', quantity: 1, price: 350 },
      { id: 'item_102', name: 'Garlic Naan', quantity: 2, price: 100 },
    ]);
  });

  it('builds claim token and print payload', () => {
    const token = buildClaimToken(sample.restID, sample.OrderInfo.Order.orderID);
    const url = `http://localhost:3101/c/${token}`;
    const payload = buildPrintPayload(url, '100');
    expect(payload.status).toBe('success');
    expect(payload.reclaim_print_payload.qr_code_url).toBe(url);
    expect(payload.reclaim_print_payload.sticker_line_1).toContain('₹100');
  });

  it('maps order.created payload shape', () => {
    const claimUrl = 'http://localhost:3101/c/abc';
    const eventPayload = toOrderCreatedPayload(sample, claimUrl);
    expect(eventPayload.petpooja_order_id).toBe('PET_ZOM_8831092');
    expect(eventPayload.aggregator).toBe('zomato');
    expect(eventPayload.gross_amount).toBe(550);
    expect(eventPayload.claim_qr_url).toBe(claimUrl);
    expect(eventPayload.order_items).toHaveLength(2);
  });
});
