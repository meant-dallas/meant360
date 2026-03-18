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

  const start = new Date(startDate).toISOString();
  const end = new Date(endDate).toISOString();

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

      // Only include completed incoming payments
      if (amount <= 0 || info.transaction_status !== 'S') continue;

      // Build description: prefer item names from cart, then subject/note
      const itemNames = cart?.item_details
        ?.map((d) => d.item_name)
        .filter(Boolean)
        .join(', ');
      const description = itemNames || info.transaction_subject || info.transaction_note || 'PayPal Payment';

      transactions.push({
        id: generateId(),
        externalId: info.transaction_id,
        source: 'PayPal',
        amount,
        fee,
        netAmount: amount - fee,
        description,
        payerName: payer?.payer_name
          ? `${payer.payer_name.given_name || ''} ${payer.payer_name.surname || ''}`.trim()
          : '',
        payerEmail: payer?.email_address || '',
        date: info.transaction_initiation_date,
        tag: 'Untagged',
        eventName: '',
        syncedAt: new Date().toISOString(),
        notes: `PayPal Transaction ${info.transaction_id}`,
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

export async function testPayPalConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
