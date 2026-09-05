import { randomUUID } from 'crypto';
import { createSquarePayment } from '@/lib/square';
import { createPayPalOrder, capturePayPalOrder } from '@/lib/paypal';
import { buildSquareReaderDeepLinks, SQUARE_READER_APP_ID } from '@/lib/square-reader';
import { getAppUrl } from '@/lib/app-url';
import { generateId } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { eventRepository, transactionRepository, incomeRepository } from '@/repositories';
import { checkinParticipant } from './events.service';
import { logActivity } from '@/lib/audit-log';
import { NotFoundError } from './crud.service';

// ========================================
// Payment Services
// ========================================

/**
 * Validate that an event exists before processing payment.
 */
async function validateEvent(eventId: string) {
  if (eventId === 'membership' || eventId === 'membership-renewal') return null;
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

  const isMembership = data.eventId === 'membership' || data.eventId === 'membership-renewal';
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

  const isMembership = data.eventId === 'membership' || data.eventId === 'membership-renewal';
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
// Square Reader Payments (Point of Sale API deep link)
// ========================================
//
// Unlike the other payment methods above, this one hands off to the Square
// app on the staff member's phone and gets a result back later via a
// callback URL — there is no single request/response round trip. The full
// check-in payload is captured up front and replayed once the callback
// confirms the charge, because the check-in form's in-memory state does not
// reliably survive the browser navigating away to another app and back.

export interface SquareReaderCheckinPayload {
  eventName: string;
  type: 'Member' | 'Guest';
  memberId: string;
  guestId: string;
  name: string;
  email: string;
  phone: string;
  adults: number;
  kids: number;
  totalPrice: string;
  priceBreakdown: string;
  selectedActivities?: string;
  customFields?: string;
  attendeeNames?: string;
  emailConsent?: string;
  mediaConsent?: string;
}

export async function createSquareReaderCheckout(data: {
  eventId: string;
  amount: number;
  baseAmount?: number;
  currency: string;
  checkin: SquareReaderCheckinPayload;
}): Promise<{ token: string; ios: string; android: string }> {
  // Unlike the other payment methods in this file, this one is only ever
  // invoked from the check-in flow (never membership apply/renew), and the
  // callback finalizes via checkinParticipant() below, which requires a
  // real Event row — so there is no 'membership' / 'membership-renewal'
  // special case to preserve here.
  await validateEvent(data.eventId);

  if (!SQUARE_READER_APP_ID) {
    throw new Error('NEXT_PUBLIC_SQUARE_APP_ID is not configured');
  }

  const note = `Event Entry: ${data.checkin.eventName || 'Event'} - ${data.checkin.name || 'Unknown'}`;

  const token = randomUUID();
  await prisma.squareReaderCheckout.create({
    data: {
      token,
      eventId: data.eventId,
      amount: data.amount.toFixed(2),
      baseAmount: data.baseAmount !== undefined ? data.baseAmount.toFixed(2) : '',
      currency: data.currency,
      checkinPayload: data.checkin as unknown as Prisma.InputJsonValue,
    },
  });

  const callbackUrl = `${getAppUrl()}/api/payments/square-reader/callback/${token}`;
  const { ios, android } = buildSquareReaderDeepLinks({
    amountCents: Math.round(data.amount * 100),
    currency: data.currency,
    note,
    callbackUrl,
  });

  return { token, ios, android };
}

export async function completeSquareReaderCheckout(
  token: string,
  result: { transactionId: string | null; errorCode: string | null },
): Promise<{ status: 'completed' | 'failed'; eventId: string }> {
  const record = await prisma.squareReaderCheckout.findUnique({ where: { token } });
  if (!record) throw new NotFoundError('Square Reader checkout');

  // Callback fired twice (e.g. the OS retried the redirect) — return the
  // already-finalized result instead of re-running the check-in.
  if (record.status !== 'pending') {
    return { status: record.status === 'completed' ? 'completed' : 'failed', eventId: record.eventId };
  }

  if (!result.transactionId || result.errorCode) {
    await prisma.squareReaderCheckout.update({
      where: { token },
      data: {
        status: 'failed',
        errorMessage: result.errorCode || 'Square did not return a transaction ID',
        completedAt: new Date(),
      },
    });
    return { status: 'failed', eventId: record.eventId };
  }

  const checkin = record.checkinPayload as unknown as SquareReaderCheckinPayload;
  const amount = Number(record.amount);
  const baseAmount = record.baseAmount ? Number(record.baseAmount) : amount;
  const note = `Event Entry: ${checkin.eventName || 'Event'} - ${checkin.name || 'Unknown'}`;

  // Square has confirmed the card was actually charged by this point.
  // Everything below is our own bookkeeping — if any of it throws, the
  // charge still happened, so the failure message must make that
  // unmistakable rather than reading like a normal declined-card failure
  // (which would invite staff to charge the guest again).
  try {
    const checkinRecord = await checkinParticipant(record.eventId, {
      type: checkin.type,
      memberId: checkin.memberId,
      guestId: checkin.guestId,
      name: checkin.name,
      email: checkin.email,
      phone: checkin.phone,
      adults: checkin.adults,
      kids: checkin.kids,
      totalPrice: checkin.totalPrice,
      priceBreakdown: checkin.priceBreakdown,
      paymentStatus: 'Paid',
      paymentMethod: 'Square Reader',
      transactionId: result.transactionId,
      selectedActivities: checkin.selectedActivities,
      customFields: checkin.customFields,
      attendeeNames: checkin.attendeeNames,
      emailConsent: checkin.emailConsent,
      mediaConsent: checkin.mediaConsent,
    });

    // Match the audit trail every other check-in path produces (see
    // POST /api/events/[eventId]/checkins) — otherwise Square Reader
    // check-ins would only show up as a generic "Payment" log entry, not
    // as a check-in.
    if (!(checkinRecord as Record<string, unknown>).alreadyCheckedIn) {
      logActivity({
        userEmail: checkin.email,
        action: 'create',
        entityType: 'Check-in',
        entityId: String((checkinRecord as Record<string, unknown>).id || ''),
        entityLabel: checkin.name,
        description: `Checked in for event (${checkin.type}) via Square Reader`,
      });
    }

    await logTransaction({
      externalId: result.transactionId,
      source: 'Square',
      amount,
      description: `${note} (Reader)`,
      payerName: checkin.name,
      payerEmail: checkin.email,
      eventName: checkin.eventName || '',
      tag: 'Event Entry',
    });

    await logFinTransaction({
      externalId: result.transactionId,
      provider: 'square',
      amount: baseAmount,
      description: `${note} (Reader)`,
      payerName: checkin.name,
      payerEmail: checkin.email,
      eventId: record.eventId,
      isMembership: false,
      eventName: checkin.eventName || '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check-in failed after a successful charge';
    await prisma.squareReaderCheckout.update({
      where: { token },
      data: {
        status: 'failed',
        squareTransactionId: result.transactionId,
        errorMessage: `Card was already charged (Square transaction ${result.transactionId}) but check-in could not be completed: ${message}. Do NOT charge this guest again — find them in Square's dashboard and check them in manually.`,
        completedAt: new Date(),
      },
    });
    return { status: 'failed', eventId: record.eventId };
  }

  await prisma.squareReaderCheckout.update({
    where: { token },
    data: {
      status: 'completed',
      squareTransactionId: result.transactionId,
      completedAt: new Date(),
    },
  });

  return { status: 'completed', eventId: record.eventId };
}

export async function getSquareReaderCheckoutStatus(token: string) {
  const record = await prisma.squareReaderCheckout.findUnique({ where: { token } });
  if (!record) throw new NotFoundError('Square Reader checkout');
  return {
    status: record.status,
    eventId: record.eventId,
    transactionId: record.squareTransactionId || null,
    errorMessage: record.errorMessage || null,
  };
}
