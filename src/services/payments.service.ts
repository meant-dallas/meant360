import { createSquarePayment } from '@/lib/square';
import { createPayPalOrder, capturePayPalOrder } from '@/lib/paypal';
import { generateId } from '@/lib/utils';
import { eventRepository, transactionRepository } from '@/repositories';
import { NotFoundError } from './crud.service';

// ========================================
// Payment Services
// ========================================

/**
 * Validate that an event exists before processing payment.
 */
async function validateEvent(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');
  return event;
}

/**
 * Log a transaction to the Transactions table.
 */
async function logTransaction(data: {
  externalId: string;
  source: 'Square' | 'PayPal';
  amount: number;
  description: string;
  payerName: string;
  payerEmail: string;
  eventName: string;
}) {
  const now = new Date().toISOString();
  await transactionRepository.create({
    id: generateId(),
    externalId: data.externalId,
    source: data.source,
    amount: data.amount,
    fee: 0,
    netAmount: data.amount,
    description: data.description,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    date: now,
    tag: 'Event Entry',
    eventName: data.eventName,
    syncedAt: now,
    notes: `${data.source} Payment ${data.externalId}`,
  });
}

export async function processSquarePayment(data: {
  sourceId: string;
  amount: number;
  currency: string;
  eventId: string;
  eventName: string;
  payerName: string;
  payerEmail: string;
}) {
  await validateEvent(data.eventId);

  const amountCents = Math.round(data.amount * 100);
  const note = `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;

  const result = await createSquarePayment(data.sourceId, amountCents, data.currency, note);

  await logTransaction({
    externalId: result.paymentId,
    source: 'Square',
    amount: data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventName: data.eventName,
  });

  return { transactionId: result.paymentId };
}

export async function createPayPalOrderService(data: {
  amount: number;
  currency: string;
  description: string;
  eventId: string;
}) {
  await validateEvent(data.eventId);

  const result = await createPayPalOrder(
    String(data.amount),
    data.currency,
    data.description,
  );

  return { orderId: result.orderId };
}

export async function capturePayPalOrderService(data: {
  orderId: string;
  eventId: string;
  eventName: string;
  payerName: string;
  payerEmail: string;
  amount: number;
}) {
  await validateEvent(data.eventId);

  const result = await capturePayPalOrder(data.orderId);

  const note = `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;
  await logTransaction({
    externalId: result.transactionId,
    source: 'PayPal',
    amount: data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventName: data.eventName,
  });

  return { transactionId: result.transactionId };
}
