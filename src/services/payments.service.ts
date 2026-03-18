import { createSquarePayment, createTerminalCheckout, getTerminalCheckout, cancelTerminalCheckout } from '@/lib/square';
import { createPayPalOrder, capturePayPalOrder } from '@/lib/paypal';
import { generateId } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
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
 * Log a transaction to the old Transactions table (legacy).
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
 * Resolve a FinCategory ID by name. Returns null if not found.
 */
async function resolveFinCategoryId(name: string): Promise<string | null> {
  const cat = await prisma.finCategory.findFirst({ where: { name } });
  return cat?.id ?? null;
}

/**
 * Log a transaction to FinRawTransaction (accounting module) with full context.
 * This is the primary accounting record — sync will skip it via externalId match.
 */
async function logFinTransaction(data: {
  externalId: string;
  provider: 'square' | 'paypal';
  amount: number;
  description: string;
  payerName: string;
  payerEmail: string;
  eventId?: string;
  isMembership: boolean;
  eventName: string;
}) {
  const categoryName = data.isMembership ? 'Membership' : 'Event Income';
  const categoryId = await resolveFinCategoryId(categoryName);

  await prisma.finRawTransaction.create({
    data: {
      provider: data.provider,
      externalId: data.externalId,
      type: 'income',
      grossAmount: new Prisma.Decimal(data.amount),
      fee: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(data.amount),
      payerName: data.payerName || null,
      payerEmail: data.payerEmail || null,
      description: data.description,
      transactionDate: new Date(),
      status: 'Completed',
      categoryId,
      eventId: data.isMembership ? null : data.eventId || null,
    },
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
  baseAmount?: number;
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

  const identity = data.payerEmail || data.payerName || '';
  const itemLabel = identity
    ? `${data.eventName} (${identity})`
    : data.eventName;
  const result = await createSquarePayment(data.sourceId, amountCents, data.currency, note, itemLabel);

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

  await logFinTransaction({
    externalId: result.paymentId,
    provider: 'square',
    amount: data.baseAmount ?? data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventId: data.eventId,
    isMembership,
    eventName: data.eventName,
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
  itemName?: string;
  payerName?: string;
  payerEmail?: string;
}) {
  await validateEvent(data.eventId);

  // Build item name with payer identity for clear transaction tracking
  const identity = data.payerEmail || data.payerName || '';
  const itemLabel = identity
    ? `${data.itemName || data.description} (${identity})`
    : data.itemName || data.description;

  const result = await createPayPalOrder(
    String(data.amount),
    data.currency,
    data.description,
    itemLabel,
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
  baseAmount?: number;
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

  await logFinTransaction({
    externalId: result.transactionId,
    provider: 'paypal',
    amount: data.baseAmount ?? data.amount,
    description: note,
    payerName: data.payerName,
    payerEmail: data.payerEmail,
    eventId: data.eventId,
    isMembership,
    eventName: data.eventName,
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

// ========================================
// Square Terminal Payments
// ========================================

export async function createTerminalPayment(data: {
  amount: number;
  currency: string;
  deviceId: string;
  eventId: string;
  eventName: string;
  payerName: string;
  payerEmail: string;
}) {
  await validateEvent(data.eventId);

  const amountCents = Math.round(data.amount * 100);
  const isMembership = data.eventId === 'membership';
  const note = isMembership
    ? `Membership: ${data.eventName || 'Membership'} - ${data.payerName || 'Unknown'}`
    : `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;

  const result = await createTerminalCheckout({
    amountCents,
    currency: data.currency,
    deviceId: data.deviceId,
    note,
  });

  return { checkoutId: result.checkoutId, status: result.status };
}

export async function getTerminalPaymentStatus(data: {
  checkoutId: string;
  eventId: string;
  eventName: string;
  payerName: string;
  payerEmail: string;
  amount: number;
  baseAmount?: number;
}) {
  const result = await getTerminalCheckout(data.checkoutId);

  // If completed, log the transaction
  if (result.status === 'COMPLETED' && result.paymentId) {
    const isMembership = data.eventId === 'membership';
    const note = isMembership
      ? `Membership: ${data.eventName || 'Membership'} - ${data.payerName || 'Unknown'}`
      : `Event Entry: ${data.eventName || 'Event'} - ${data.payerName || 'Unknown'}`;

    await logTransaction({
      externalId: result.paymentId,
      source: 'Square',
      amount: data.amount,
      description: `${note} (Terminal)`,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
      eventName: data.eventName,
      tag: isMembership ? 'Membership' : 'Event Entry',
    });

    await logFinTransaction({
      externalId: result.paymentId,
      provider: 'square',
      amount: data.baseAmount ?? data.amount,
      description: `${note} (Terminal)`,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
      eventId: data.eventId,
      isMembership,
      eventName: data.eventName,
    });

    if (isMembership) {
      await createMembershipIncome({
        amount: data.amount,
        payerName: data.payerName,
        paymentMethod: 'Square Terminal',
        transactionId: result.paymentId,
      });
    }
  }

  return {
    status: result.status,
    paymentId: result.paymentId,
  };
}

export async function cancelTerminalPayment(checkoutId: string) {
  await cancelTerminalCheckout(checkoutId);
  return { cancelled: true };
}
