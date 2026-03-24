import { Client, Environment } from 'square';
import * as Sentry from '@sentry/nextjs';
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

  // Use Payments API to get gross, processing fees, and net amounts
  do {
    // Note: Square SDK serializes undefined positional params as empty query params
    // causing &&& in the URL which Square rejects. Only pass params up to the last defined one.
    const beginTime = new Date(startDate).toISOString();
    const endTime = new Date(endDate + 'T23:59:59Z').toISOString();
    const response = cursor
      ? await client.paymentsApi.listPayments(beginTime, endTime, 'ASC', cursor)
      : await client.paymentsApi.listPayments(beginTime, endTime);

    const payments = (response.result.payments || []).filter(
      (p) => !locationId || p.locationId === locationId,
    );

    for (const payment of payments) {
      if (payment.status !== 'COMPLETED') continue;

      const grossAmount = payment.totalMoney ? Number(payment.totalMoney.amount) / 100 : 0;
      const fee = payment.processingFee?.reduce(
        (sum, f) => sum + (f.amountMoney ? Number(f.amountMoney.amount) / 100 : 0),
        0,
      ) ?? 0;
      const netAmount = grossAmount - fee;

      // Get line item names from the linked order if available
      let description = 'Square Payment';
      if (payment.orderId) {
        try {
          const orderResponse = await client.ordersApi.retrieveOrder(payment.orderId);
          const order = orderResponse.result.order;
          if (order?.lineItems?.length) {
            description = order.lineItems.map((li) => li.name).join(', ');
          }
        } catch {
          // Order lookup is best-effort
        }
      }

      transactions.push({
        id: generateId(),
        externalId: payment.id || '',
        source: 'Square',
        amount: grossAmount,
        fee,
        netAmount,
        description: payment.note || description,
        payerName: '',
        payerEmail: payment.buyerEmailAddress || '',
        date: payment.createdAt || new Date().toISOString(),
        tag: 'Untagged',
        eventName: '',
        syncedAt: new Date().toISOString(),
        notes: `Square Payment ${payment.id}${payment.orderId ? ` (Order ${payment.orderId})` : ''}`,
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
  itemName?: string,
): Promise<{ paymentId: string; status: string; orderId?: string }> {
  const client = getClient();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error('SQUARE_LOCATION_ID is not configured');

  const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create an order with line items so the item name shows up in sync
  let orderId: string | undefined;
  if (itemName) {
    const orderResponse = await client.ordersApi.createOrder({
      order: {
        locationId,
        lineItems: [
          {
            name: itemName,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amountCents),
              currency,
            },
          },
        ],
        state: 'OPEN',
      },
      idempotencyKey: `order-${idempotencyKey}`,
    });
    orderId = orderResponse.result.order?.id;
  }

  const response = await client.paymentsApi.createPayment({
    sourceId,
    idempotencyKey,
    amountMoney: {
      amount: BigInt(amountCents),
      currency,
    },
    locationId,
    orderId,
    note,
  });

  const payment = response.result.payment;
  if (!payment?.id) throw new Error('Square payment failed: no payment ID returned');

  return {
    paymentId: payment.id,
    status: payment.status || 'UNKNOWN',
    orderId,
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
    Sentry.captureException(error, { extra: { context: 'Square terminal devices list' } });
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
