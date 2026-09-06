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

/**
 * Refund all or part of a completed Square payment.
 * idempotencyKey should be stable across retries of the *same* logical refund
 * (e.g. derived from participantId + target amount) so a retried request can't
 * double-refund.
 */
export async function refundSquarePayment(
  paymentId: string,
  amountCents: number,
  currency: string,
  idempotencyKey: string,
  reason?: string,
): Promise<{ refundId: string; status: string }> {
  const client = getClient();

  const response = await client.refundsApi.refundPayment({
    idempotencyKey,
    paymentId,
    amountMoney: {
      amount: BigInt(amountCents),
      currency,
    },
    reason,
  });

  const refund = response.result.refund;
  if (!refund?.id) throw new Error('Square refund failed: no refund ID returned');

  return {
    refundId: refund.id,
    status: refund.status || 'UNKNOWN',
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
