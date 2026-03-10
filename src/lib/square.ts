import { Client, Environment } from 'square';
import type { Transaction } from '@/types';
import { generateId } from './utils';

// ========================================
// Square API Integration (Read-Only)
// ========================================

function getClient(): Client {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment:
      process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
  });
}

export interface SquareSyncResult {
  imported: number;
  skipped: number;
  transactions: Transaction[];
}

export async function fetchSquareTransactions(
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const client = getClient();
  const locationId = process.env.SQUARE_LOCATION_ID;

  if (!locationId) {
    throw new Error('SQUARE_LOCATION_ID is not configured');
  }

  const transactions: Transaction[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.ordersApi.searchOrders({
      locationIds: [locationId],
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: new Date(startDate).toISOString(),
              endAt: new Date(endDate).toISOString(),
            },
          },
          stateFilter: {
            states: ['COMPLETED'],
          },
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'DESC',
        },
      },
      cursor,
    });

    const orders = response.result.orders || [];

    for (const order of orders) {
      const totalMoney = order.totalMoney;
      const amount = totalMoney ? Number(totalMoney.amount) / 100 : 0;

      transactions.push({
        id: generateId(),
        externalId: order.id || '',
        source: 'Square',
        amount,
        fee: 0, // Square fees come from a separate API
        netAmount: amount,
        description: order.lineItems?.map((li) => li.name).join(', ') || 'Square Payment',
        payerName: '',
        payerEmail: '',
        date: order.createdAt || new Date().toISOString(),
        tag: 'Untagged',
        eventName: '',
        syncedAt: new Date().toISOString(),
        notes: `Square Order ${order.id}`,
      });
    }

    cursor = response.result.cursor;
  } while (cursor);

  return transactions;
}

export async function createSquarePayment(
  sourceId: string,
  amountCents: number,
  currency: string,
  note: string,
): Promise<{ paymentId: string; status: string }> {
  const client = getClient();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error('SQUARE_LOCATION_ID is not configured');

  const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const response = await client.paymentsApi.createPayment({
    sourceId,
    idempotencyKey,
    amountMoney: {
      amount: BigInt(amountCents),
      currency,
    },
    locationId,
    note,
  });

  const payment = response.result.payment;
  if (!payment?.id) throw new Error('Square payment failed: no payment ID returned');

  return {
    paymentId: payment.id,
    status: payment.status || 'UNKNOWN',
  };
}

export async function testSquareConnection(): Promise<boolean> {
  try {
    const client = getClient();
    const response = await client.locationsApi.listLocations();
    return (response.result.locations?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ========================================
// Square Terminal API
// ========================================

export interface TerminalDevice {
  id: string;
  name: string;
  status: string;
}

/**
 * List paired Square Terminal devices for the configured location.
 */
export async function listTerminalDevices(): Promise<TerminalDevice[]> {
  const isSandbox = process.env.SQUARE_ENVIRONMENT !== 'production';

  // In sandbox, return a test device since the Devices API requires a real paired device
  if (isSandbox) {
    return [{
      id: '9fa747a2-25ff-48ee-b078-04381f7c828f',
      name: 'Sandbox Test Terminal',
      status: 'PAIRED',
    }];
  }

  const client = getClient();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error('SQUARE_LOCATION_ID is not configured');

  try {
    const response = await client.devicesApi.listDevices(
      undefined,
      undefined,
      undefined,
      locationId,
    );

    const devices = response.result.devices || [];
    return devices.map((d) => ({
      id: d.id || '',
      name: d.attributes?.name || `Terminal ${d.id}`,
      status: d.status?.category || 'UNKNOWN',
    }));
  } catch (error) {
    console.error('Failed to list terminal devices:', error);
    return [];
  }
}

/**
 * Create a Terminal checkout — sends a payment request to a Square Terminal device.
 * The device will prompt the customer to tap/insert their card.
 */
export async function createTerminalCheckout(data: {
  amountCents: number;
  currency: string;
  deviceId: string;
  note: string;
}): Promise<{ checkoutId: string; status: string }> {
  const client = getClient();
  const idempotencyKey = `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const response = await client.terminalApi.createTerminalCheckout({
    idempotencyKey,
    checkout: {
      amountMoney: {
        amount: BigInt(data.amountCents),
        currency: data.currency,
      },
      deviceOptions: {
        deviceId: data.deviceId,
        skipReceiptScreen: true,
        collectSignature: false,
      },
      note: data.note,
      paymentType: 'CARD_PRESENT',
    },
  });

  const checkout = response.result.checkout;
  if (!checkout?.id) throw new Error('Failed to create Terminal checkout');

  return {
    checkoutId: checkout.id,
    status: checkout.status || 'PENDING',
  };
}

/**
 * Get the status of a Terminal checkout.
 * Returns the payment ID once the checkout is completed.
 */
export async function getTerminalCheckout(checkoutId: string): Promise<{
  status: string;
  paymentId: string | null;
}> {
  const client = getClient();

  const response = await client.terminalApi.getTerminalCheckout(checkoutId);
  const checkout = response.result.checkout;
  if (!checkout) throw new Error('Terminal checkout not found');

  return {
    status: checkout.status || 'UNKNOWN',
    paymentId: checkout.paymentIds?.[0] || null,
  };
}

/**
 * Cancel a pending Terminal checkout.
 */
export async function cancelTerminalCheckout(checkoutId: string): Promise<void> {
  const client = getClient();
  await client.terminalApi.cancelTerminalCheckout(checkoutId);
}
