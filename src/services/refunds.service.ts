import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { sendEmail } from './email.service';
import { buildTreasurerAlertEmail } from '@/lib/registration-emails';
import { logActivity } from '@/lib/audit-log';
import { generateId } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { incomeRepository, registrationLedgerRepository } from '@/repositories';
import { refundSquarePayment } from '@/lib/square';
import { refundPayPalCapture, getPayPalCaptureStatus, PayPalApiError } from '@/lib/paypal';
import { remainingRefundableCharges, type LedgerEntry } from '@/lib/payment-history';

// Payment methods we're able to auto-refund via a provider API. Everything
// else (zelle, cash, in-person, etc.) is refunded manually by the committee.
const AUTO_REFUNDABLE_METHODS = new Set(['square', 'paypal']);

export type RefundOutcome =
  | { status: 'none' }
  | { status: 'refunded'; refundedAmount: number; note?: string }
  | { status: 'partial'; refundedAmount: number; remainingAmount: number; note: string }
  | { status: 'manual'; note: string }
  | { status: 'failed'; error: string; refundedAmount: number };

/**
 * Deterministic idempotency key for a logical refund — stable across retries
 * of the *same* refund (same participant, source transaction, and amount) so
 * a retried request can't double-refund, while a genuinely different refund
 * (different amount, e.g. a later edit) naturally gets a different key.
 */
function refundIdempotencyKey(participantId: string, transactionId: string, amountCents: number): string {
  return crypto
    .createHash('sha256')
    .update(`refund:${participantId}:${transactionId}:${amountCents}`)
    .digest('hex')
    .slice(0, 40);
}

async function resolveExpenseCategoryId(name: string): Promise<string | null> {
  const cat = await prisma.finCategory.findFirst({ where: { name, type: 'expense' } });
  return cat?.id ?? null;
}

/**
 * Book a refund on both accounting ledgers: a negative Income row (matches
 * the existing manual-refund convention in the Finance module) and a
 * FinRawTransaction expense row, mirroring how original charges are logged
 * in payments.service.ts.
 */
async function bookRefundLedger(opts: {
  eventId: string;
  eventName: string;
  amount: number;
  payerName: string;
  payerEmail: string;
  paymentMethod: string;
  refundId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await incomeRepository.create({
    id: generateId(),
    incomeType: 'Refund',
    eventName: opts.eventName,
    amount: -Math.abs(opts.amount),
    date: now.split('T')[0],
    paymentMethod: opts.paymentMethod,
    payerName: opts.payerName,
    notes: `Auto-refund via ${opts.paymentMethod} (${opts.refundId})`,
    createdAt: now,
    updatedAt: now,
  });

  const categoryId = await resolveExpenseCategoryId('Event Income');
  await prisma.finRawTransaction.create({
    data: {
      provider: opts.paymentMethod,
      externalId: opts.refundId,
      type: 'expense',
      grossAmount: new Prisma.Decimal(opts.amount),
      fee: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(opts.amount),
      payerName: opts.payerName || null,
      payerEmail: opts.payerEmail || null,
      description: `Refund: ${opts.eventName}`,
      transactionDate: new Date(),
      status: 'Completed',
      categoryId,
      eventId: opts.eventId,
    },
  });
}

interface ChargeContext {
  participantId: string;
  eventId: string;
  eventName: string;
  participantName: string;
  participantEmail: string;
  reason: string;
}

/**
 * Refund exactly `amount` against a single provider charge. Never throws —
 * notifies the treasurer itself on failure/already-refunded, since each
 * charge's specific transaction/error context belongs in that email.
 */
async function refundSingleCharge(
  ctx: ChargeContext,
  method: string,
  transactionId: string,
  amount: number,
): Promise<{ status: 'refunded'; refundId: string } | { status: 'already_refunded'; note: string } | { status: 'failed'; error: string }> {
  const amountCents = Math.round(amount * 100);
  const idempotencyKey = refundIdempotencyKey(ctx.participantId, transactionId, amountCents);

  Sentry.addBreadcrumb({
    category: 'refund',
    message: 'Refund attempt starting for a single charge',
    level: 'info',
    data: { participantId: ctx.participantId, eventId: ctx.eventId, method, amount, transactionId, idempotencyKey },
  });

  // For PayPal, check the capture's current status first — if it's already
  // fully refunded (e.g. a prior attempt succeeded on PayPal's side but this
  // system didn't get to record it), calling refund again would fail with
  // REFUND_AMOUNT_EXCEEDED. Treat that as its own outcome rather than a
  // failure. We deliberately don't book a ledger entry here since we can't
  // tell whether the earlier attempt already booked one — a treasurer
  // notification is safer than risking a duplicate entry.
  if (method === 'paypal') {
    try {
      const captureStatus = await getPayPalCaptureStatus(transactionId);
      Sentry.addBreadcrumb({
        category: 'refund',
        message: 'PayPal capture status checked',
        level: 'info',
        data: { transactionId, status: captureStatus.status },
      });
      if (captureStatus.status === 'REFUNDED') {
        const note = 'This charge was already refunded on PayPal — no further action needed.';
        await notifyTreasurer({
          reason: 'refund_failed',
          eventId: ctx.eventId,
          eventName: ctx.eventName,
          participantId: ctx.participantId,
          participantName: ctx.participantName,
          participantEmail: ctx.participantEmail,
          amount: String(amount),
          paymentMethod: method,
          transactionId,
          errorMessage: `${note} Please verify the ledger already has this refund recorded.`,
        });
        return { status: 'already_refunded', note };
      }
    } catch (err) {
      // Best-effort — if the status check itself fails, fall through and
      // attempt the refund normally; the catch block below handles it.
      Sentry.captureException(err, { level: 'warning', extra: { context: 'PayPal capture status check failed', transactionId, ...ctx } });
    }
  }

  try {
    let refundId: string;
    if (method === 'square') {
      const result = await refundSquarePayment(transactionId, amountCents, 'USD', idempotencyKey, ctx.reason);
      refundId = result.refundId;
    } else {
      const result = await refundPayPalCapture(transactionId, amount.toFixed(2), 'USD', idempotencyKey, ctx.reason);
      refundId = result.refundId;
    }

    Sentry.addBreadcrumb({
      category: 'refund',
      message: 'Provider refund succeeded',
      level: 'info',
      data: { participantId: ctx.participantId, method, refundId, amount },
    });

    await bookRefundLedger({
      eventId: ctx.eventId,
      eventName: ctx.eventName,
      amount,
      payerName: ctx.participantName,
      payerEmail: ctx.participantEmail,
      paymentMethod: method,
      refundId,
    });

    return { status: 'refunded', refundId };
  } catch (err) {
    // PayPal's specific "nothing left to refund" error — treat like the
    // proactive status check above rather than a generic failure.
    if (err instanceof PayPalApiError && err.issue === 'REFUND_AMOUNT_EXCEEDED') {
      const note = 'This charge was already refunded on PayPal — no further action needed.';
      Sentry.captureMessage('PayPal refund exceeded remaining capture amount (already refunded)', {
        level: 'warning',
        extra: { context: 'Registration refund — already refunded', debugId: err.debugId, transactionId, ...ctx },
      });
      await notifyTreasurer({
        reason: 'refund_failed',
        eventId: ctx.eventId,
        eventName: ctx.eventName,
        participantId: ctx.participantId,
        participantName: ctx.participantName,
        participantEmail: ctx.participantEmail,
        amount: String(amount),
        paymentMethod: method,
        transactionId,
        errorMessage: `${note} Please verify the ledger already has this refund recorded. (PayPal debug_id: ${err.debugId || 'n/a'})`,
      });
      return { status: 'already_refunded', note };
    }

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    Sentry.captureException(err, {
      extra: {
        context: 'Registration refund failed',
        participantId: ctx.participantId,
        eventId: ctx.eventId,
        method,
        amount,
        transactionId,
        paypalIssue: err instanceof PayPalApiError ? err.issue : undefined,
        paypalDebugId: err instanceof PayPalApiError ? err.debugId : undefined,
      },
    });
    await notifyTreasurer({
      reason: 'refund_failed',
      eventId: ctx.eventId,
      eventName: ctx.eventName,
      participantId: ctx.participantId,
      participantName: ctx.participantName,
      participantEmail: ctx.participantEmail,
      amount: String(amount),
      paymentMethod: method,
      transactionId,
      errorMessage,
    });
    return { status: 'failed', error: errorMessage };
  }
}

/**
 * Refund up to `amount` off a registration, walking its payment ledger and
 * refunding against each capture up to what that capture actually holds —
 * a registration can be paid across multiple captures (initial payment plus
 * a separate capture per "pay more" edit), so refunding the full amount
 * against only the most recent capture would either fail or over-refund.
 *
 * `fallback*` params synthesize (and permanently record) a single-charge
 * ledger entry for participants who paid before this ledger existed —
 * best-effort only, since we can't reconstruct a pre-ledger multi-capture
 * history for anyone who had already done a top-up edit.
 *
 * Never throws — a failed/manual/partial outcome is reported via the
 * returned status so the caller can still proceed with the
 * cancellation/edit. Writes 'refund' entries directly to the registration
 * ledger as they happen; the caller doesn't need to persist anything.
 */
export async function refundRegistrationPayment(opts: {
  participantId: string;
  eventId: string;
  eventName: string;
  participantName: string;
  participantEmail: string;
  amount: string;
  reason: string;
  // Set false when the event's "Auto-Refund on Cancellation" toggle is off —
  // treats every charge as manual instead of attempting provider calls.
  autoRefundEnabled?: boolean;
  fallbackMethod?: string;
  fallbackTransactionId?: string;
  fallbackAmount?: string;
}): Promise<RefundOutcome> {
  const ctx: ChargeContext = {
    participantId: opts.participantId,
    eventId: opts.eventId,
    eventName: opts.eventName,
    participantName: opts.participantName,
    participantEmail: opts.participantEmail,
    reason: opts.reason,
  };

  Sentry.addBreadcrumb({
    category: 'refund',
    message: 'refundRegistrationPayment called',
    level: 'info',
    data: { participantId: opts.participantId, eventId: opts.eventId, amount: opts.amount, reason: opts.reason, autoRefundEnabled: opts.autoRefundEnabled !== false },
  });

  const targetAmount = parseFloat(opts.amount || '0');
  if (!(targetAmount > 0)) return { status: 'none' };

  let entries: LedgerEntry[] = (await registrationLedgerRepository.findByParticipantId(opts.participantId)) as unknown as LedgerEntry[];
  if (entries.filter((e) => e.type === 'charge').length === 0 && opts.fallbackTransactionId) {
    // Pre-ledger participant — persist a single synthesized charge entry so
    // refund logic (now and in the future) has something to work against.
    // Best-effort: we can't know whether this participant had multiple
    // captures before the ledger existed, so this may still under/over-
    // estimate what that specific capture holds — the same limitation as
    // before this fix, not a regression.
    await registrationLedgerRepository.create({
      eventId: opts.eventId,
      participantId: opts.participantId,
      email: opts.participantEmail,
      type: 'charge',
      method: opts.fallbackMethod || '',
      transactionId: opts.fallbackTransactionId,
      amount: opts.fallbackAmount || opts.amount,
      note: 'Backfilled from pre-ledger registration data',
    });
    entries = [...entries, {
      type: 'charge',
      method: opts.fallbackMethod || '',
      transactionId: opts.fallbackTransactionId,
      amount: opts.fallbackAmount || opts.amount,
    }];
  }

  const charges = remainingRefundableCharges(entries);
  if (charges.length === 0) {
    const note = 'No known payment transaction found for this registration — please refund manually.';
    await notifyTreasurer({
      reason: 'manual_refund_needed',
      eventId: opts.eventId,
      eventName: opts.eventName,
      participantId: opts.participantId,
      participantName: opts.participantName,
      participantEmail: opts.participantEmail,
      amount: opts.amount,
      paymentMethod: opts.fallbackMethod || '',
      errorMessage: 'No charge entries in the registration ledger and no fallback transaction id.',
    });
    return { status: 'manual', note };
  }

  let remaining = targetAmount;
  let refundedTotal = 0;
  let hadFailure = false;
  let hadManual = false;

  for (const charge of charges) {
    if (remaining <= 0.001) break;
    const amountForCharge = Math.min(remaining, charge.remaining);
    if (amountForCharge <= 0.001) continue;

    const method = charge.method.toLowerCase();

    if (opts.autoRefundEnabled === false) {
      hadManual = true;
      continue;
    }

    if (!AUTO_REFUNDABLE_METHODS.has(method) || !charge.transactionId) {
      hadManual = true;
      await notifyTreasurer({
        reason: 'manual_refund_needed',
        eventId: opts.eventId,
        eventName: opts.eventName,
        participantId: opts.participantId,
        participantName: opts.participantName,
        participantEmail: opts.participantEmail,
        amount: String(amountForCharge),
        paymentMethod: charge.method,
        transactionId: charge.transactionId,
      });
      continue;
    }

    const result = await refundSingleCharge(ctx, method, charge.transactionId, amountForCharge);
    if (result.status === 'refunded') {
      refundedTotal += amountForCharge;
      remaining -= amountForCharge;
      await registrationLedgerRepository.create({
        eventId: opts.eventId,
        participantId: opts.participantId,
        email: opts.participantEmail,
        type: 'refund',
        method: charge.method,
        transactionId: result.refundId,
        amount: String(amountForCharge),
        refundsTransactionId: charge.transactionId,
        note: opts.reason,
      });
    } else if (result.status === 'already_refunded') {
      // The money's already back with the payer — treat this portion as covered.
      remaining -= amountForCharge;
    } else {
      hadFailure = true;
    }
  }

  if (opts.autoRefundEnabled === false && hadManual) {
    await notifyTreasurer({
      reason: 'manual_refund_needed',
      eventId: opts.eventId,
      eventName: opts.eventName,
      participantId: opts.participantId,
      participantName: opts.participantName,
      participantEmail: opts.participantEmail,
      amount: opts.amount,
      paymentMethod: opts.fallbackMethod || charges[0]?.method || '',
      errorMessage: 'Auto-refund is disabled for this event (see the event\'s "Auto-Refund on Cancellation" setting).',
    });
  }

  if (remaining <= 0.001) {
    return { status: 'refunded', refundedAmount: refundedTotal };
  }
  if (refundedTotal <= 0.001 && !hadFailure) {
    const note = opts.autoRefundEnabled === false
      ? 'Auto-refund is turned off for this event — this payment will be refunded manually by the committee.'
      : 'This payment method is refunded manually by the committee.';
    return { status: 'manual', note };
  }
  if (hadFailure && refundedTotal <= 0.001) {
    return { status: 'failed', error: 'The refund could not be processed automatically.', refundedAmount: refundedTotal };
  }
  return {
    status: 'partial',
    refundedAmount: refundedTotal,
    remainingAmount: remaining,
    note: `$${refundedTotal.toFixed(2)} was refunded automatically; $${remaining.toFixed(2)} will be handled manually by the committee.`,
  };
}

/**
 * Alert the treasurer that an automated refund needs manual follow-up.
 * Never throws — a notification failure must not block the cancellation/edit
 * that triggered it.
 */
export async function notifyTreasurer(opts: {
  reason: 'refund_failed' | 'price_discrepancy' | 'manual_refund_needed';
  eventId: string;
  eventName: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  amount: string;
  paymentMethod: string;
  transactionId?: string;
  errorMessage?: string;
  recomputedAmount?: string;
}): Promise<void> {
  const treasurerEmail = process.env.TREASURER_EMAIL || 'treasurer@meant.org';

  const description = {
    refund_failed: `Automated refund failed — treasurer notified (${opts.paymentMethod}, $${opts.amount})`,
    price_discrepancy: `Cancellation blocked by price discrepancy — treasurer notified (stored $${opts.amount} vs recomputed $${opts.recomputedAmount})`,
    manual_refund_needed: `Cancellation needs a manual refund — treasurer notified (${opts.paymentMethod}, $${opts.amount})`,
  }[opts.reason];

  logActivity({
    userEmail: 'system',
    action: 'update',
    entityType: 'Registration',
    entityId: opts.participantId,
    entityLabel: opts.participantName || opts.participantId,
    description,
  });

  const subject = {
    refund_failed: `Refund needs manual follow-up: ${opts.eventName}`,
    price_discrepancy: `Cancellation blocked — review needed: ${opts.eventName}`,
    manual_refund_needed: `Manual refund needed: ${opts.eventName}`,
  }[opts.reason];

  try {
    await sendEmail(
      [treasurerEmail],
      subject,
      buildTreasurerAlertEmail({
        reason: opts.reason,
        eventName: opts.eventName,
        participantName: opts.participantName,
        participantEmail: opts.participantEmail,
        participantId: opts.participantId,
        amount: opts.amount,
        paymentMethod: opts.paymentMethod,
        transactionId: opts.transactionId,
        errorMessage: opts.errorMessage,
        recomputedAmount: opts.recomputedAmount,
      }),
      'system',
    );
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Treasurer alert email failed', ...opts } });
  }
}
