import { createSquarePayment } from '@/lib/square';
import { createPayPalOrder, capturePayPalOrder } from '@/lib/paypal';
import { generateId } from '@/lib/utils';
import { eventRepository, transactionRepository, incomeRepository } from '@/repositories';
import { NotFoundError } from './crud.service';

// ========================================
// Payment Services
// ========================================

/**
 * Validate that an event exists before processing payment.
 */
async function validateEvent(eventId: string) {
  if (eventId === 'membership') return null;
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
  tag?: string;
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
    tag: data.tag || 'Event Entry',
    eventName: data.eventName,
    syncedAt: now,
    notes: `${data.source} Payment ${data.externalId}`,
  });
}

/**
 * Create an Income record for a membership payment.
 */
async function createMembershipIncome(data: {
  amount: number;
  payerName: string;
  paymentMethod: string;
  transactionId: string;
}) {
  const now = new Date().toISOString();
  await incomeRepository.create({
    id: generateId(),
    incomeType: 'Membership',
    eventName: '',
    amount: data.amount,
    date: now.split('T')[0],
    paymentMethod: data.paymentMethod,
    payerName: data.payerName,
    notes: `Membership application payment (${data.transactionId})`,
    createdAt: now,
    updatedAt: now,
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

  const isMembership = data.eventId === 'membership';
  const amountCents = Math.round(data.amount * 100);
  const note = isMembership
    ? `Membership: ${data.eventName || 'Membership'} - ${data.payerName || 'Unknown'}`
    : `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;

  const result = await createSquarePayment(data.sourceId, amountCents, data.currency, note);

  await logTransaction({
    externalId: result.paymentId,
    source: 'Square',
    amount: data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventName: data.eventName,
    tag: isMembership ? 'Membership' : 'Event Entry',
  });

  if (isMembership) {
    await createMembershipIncome({
      amount: data.amount,
      payerName: data.payerName,
      paymentMethod: 'Square',
      transactionId: result.paymentId,
    });
  }

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

  const isMembership = data.eventId === 'membership';
  const result = await capturePayPalOrder(data.orderId);

  const note = isMembership
    ? `Membership: ${data.eventName || 'Membership'} - ${data.payerName || 'Unknown'}`
    : `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;
  await logTransaction({
    externalId: result.transactionId,
    source: 'PayPal',
    amount: data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventName: data.eventName,
    tag: isMembership ? 'Membership' : 'Event Entry',
  });

  if (isMembership) {
    await createMembershipIncome({
      amount: data.amount,
      payerName: data.payerName,
      paymentMethod: 'PayPal',
      transactionId: result.transactionId,
    });
  }

  return { transactionId: result.transactionId };
}
