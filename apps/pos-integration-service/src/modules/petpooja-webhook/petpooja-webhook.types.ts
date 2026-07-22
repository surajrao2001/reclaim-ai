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
