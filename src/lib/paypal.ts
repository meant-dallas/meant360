import type { Transaction } from '@/types';
import { generateId } from './utils';

// ========================================
// PayPal API Integration (Read-Only)
// ========================================

const PAYPAL_BASE_URL =
  process.env.PAYPAL_ENVIRONMENT === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`PayPal auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

interface PayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_amount: { value: string; currency_code: string };
    fee_amount?: { value: string };
    transaction_initiation_date: string;
    transaction_subject?: string;
    transaction_note?: string;
    transaction_status: string;
  };
  payer_info?: {
    payer_name?: { given_name?: string; surname?: string };
    email_address?: string;
  };
  cart_info?: {
    item_details?: Array<{
      item_name?: string;
      item_quantity?: string;
      item_unit_price?: { value: string };
    }>;
  };
}

export async function fetchPayPalTransactions(
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const accessToken = await getAccessToken();

  // Use start-of-day for start_date and end-of-day (23:59:59Z) for end_date.
  // Passing a bare date like "2026-04-03" would resolve to midnight UTC, which
  // silently excludes transactions that occurred later that day (e.g. 10 PM CDT
  // = 03:17 UTC next day). Using T23:59:59Z ensures the full UTC day is covered.
  const start = `${startDate}T00:00:00Z`;
  const end = `${endDate}T23:59:59Z`;

  const transactions: Transaction[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = new URL(`${PAYPAL_BASE_URL}/v1/reporting/transactions`);
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    url.searchParams.set('fields', 'transaction_info,payer_info,cart_info');
    url.searchParams.set('page_size', '100');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`PayPal API error: ${response.statusText}`);
    }

    const data = await response.json();
    totalPages = data.total_pages || 1;

    const items: PayPalTransaction[] = data.transaction_details || [];

    for (const item of items) {
      const info = item.transaction_info;
      const payer = item.payer_info;
      const cart = item.cart_info;
      const amount = parseFloat(info.transaction_amount.value);
      const fee = Math.abs(parseFloat(info.fee_amount?.value || '0'));

      // Only include completed transactions (S = success)
      if (info.transaction_status !== 'S') continue;
      // Skip zero-amount transactions (e.g. authorizations)
      if (amount === 0) continue;

      const isRefund = amount < 0;

      // Build description: prefer item names from cart, then subject/note
      const itemNames = cart?.item_details
        ?.map((d) => d.item_name)
        .filter(Boolean)
        .join(', ');
      const description = isRefund
        ? `Refund: ${itemNames || info.transaction_subject || info.transaction_note || 'PayPal Refund'}`
        : (itemNames || info.transaction_subject || info.transaction_note || 'PayPal Payment');

      transactions.push({
        id: generateId(),
        externalId: info.transaction_id,
        source: 'PayPal',
        amount: Math.abs(amount),
        fee: isRefund ? 0 : fee,
        netAmount: isRefund ? -Math.abs(amount) : amount - fee,
        description,
        payerName: payer?.payer_name
          ? `${payer.payer_name.given_name || ''} ${payer.payer_name.surname || ''}`.trim()
          : '',
        payerEmail: payer?.email_address || '',
        date: info.transaction_initiation_date,
        tag: 'Untagged',
        eventName: '',
        syncedAt: new Date().toISOString(),
        notes: `PayPal ${isRefund ? 'Refund' : 'Transaction'} ${info.transaction_id}`,
        isRefund,
      });
    }

    page++;
  }

  return transactions;
}

export async function createPayPalOrder(
  amount: string,
  currency: string,
  description: string,
  itemName?: string,
): Promise<{ orderId: string }> {
  const accessToken = await getAccessToken();

  const purchaseUnit: Record<string, unknown> = {
    amount: {
      currency_code: currency,
      value: amount,
      ...(itemName ? {
        breakdown: {
          item_total: { currency_code: currency, value: amount },
        },
      } : {}),
    },
    description,
  };

  if (itemName) {
    purchaseUnit.items = [
      {
        name: itemName,
        quantity: '1',
        unit_amount: { currency_code: currency, value: amount },
        category: 'DIGITAL_GOODS',
      },
    ];
  }

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal create order failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { orderId: data.id };
}

/**
 * Thrown when a PayPal API call returns a structured error response.
 * `issue` is PayPal's machine-readable error code (e.g. REFUND_AMOUNT_EXCEEDED)
 * from `details[0].issue`, when present — lets callers branch on the specific
 * failure instead of string-matching the message.
 */
export class PayPalApiError extends Error {
  status: number;
  issue?: string;
  debugId?: string;

  constructor(message: string, status: number, issue?: string, debugId?: string) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status;
    this.issue = issue;
    this.debugId = debugId;
  }
}

async function parsePayPalError(response: Response): Promise<PayPalApiError> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    const issue = parsed.details?.[0]?.issue;
    const description = parsed.details?.[0]?.description || parsed.message;
    return new PayPalApiError(description || text, response.status, issue, parsed.debug_id);
  } catch {
    return new PayPalApiError(text, response.status);
  }
}

/**
 * Look up a capture's current status — used before attempting a refund so we
 * can skip (rather than error) when it's already fully refunded.
 */
export async function getPayPalCaptureStatus(captureId: string): Promise<{ status: string; amount: string; currency: string }> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/payments/captures/${captureId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await parsePayPalError(response);
  }

  const data = await response.json();
  return {
    status: data.status || 'UNKNOWN',
    amount: data.amount?.value || '0',
    currency: data.amount?.currency_code || 'USD',
  };
}

export async function capturePayPalOrder(
  orderId: string,
): Promise<{ transactionId: string; status: string }> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal capture failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

  return {
    transactionId: capture?.id || data.id,
    status: data.status || 'UNKNOWN',
  };
}

/**
 * Refund all or part of a completed PayPal capture.
 * idempotencyKey should be stable across retries of the *same* logical refund
 * (e.g. derived from participantId + target amount) — passed as PayPal-Request-Id
 * so a retried request can't double-refund.
 */
export async function refundPayPalCapture(
  captureId: string,
  amount: string,
  currency: string,
  idempotencyKey: string,
  reason?: string,
): Promise<{ refundId: string; status: string }> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': idempotencyKey,
    },
    body: JSON.stringify({
      amount: { value: amount, currency_code: currency },
      ...(reason ? { note_to_payer: reason.slice(0, 255) } : {}),
    }),
  });

  if (!response.ok) {
    throw await parsePayPalError(response);
  }

  const data = await response.json();
  return {
    refundId: data.id,
    status: data.status || 'UNKNOWN',
  };
}

export async function testPayPalConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
