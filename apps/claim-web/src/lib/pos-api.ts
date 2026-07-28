export interface SimulateOrderResponse {
  order_id: string;
  claim_url: string;
  qr_code_url: string;
  status: string;
  message: string;
}

const POS_API =
  process.env.NEXT_PUBLIC_POS_API_URL ?? 'http://localhost:3002';

export async function simulateOrder(): Promise<SimulateOrderResponse> {
  const response = await fetch(`${POS_API}/v1/demo/simulate-order`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    let message = `Simulate order failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return (await response.json()) as SimulateOrderResponse;
}
