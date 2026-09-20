import type { RefundOutcome } from '@/types';
import { formatCurrency } from './utils';

/**
 * Turns a RefundOutcome into an accurate, user-facing message + tone for a
 * toast/banner. The cancellation itself always succeeds independent of the
 * refund outcome — this is what tells the difference between "cancelled and
 * refunded" (true) and "cancelled, but the refund needs manual follow-up"
 * (also a legitimate outcome, just not one that should be announced as a
 * clean refund success).
 */
export function describeRefundOutcome(outcome: RefundOutcome, subjectLabel: string): { message: string; tone: 'success' | 'warning' | 'error' } {
  switch (outcome.status) {
    case 'none':
      return { message: `${subjectLabel} cancelled.`, tone: 'success' };
    case 'refunded':
      return { message: `${subjectLabel} cancelled and ${formatCurrency(outcome.refundedAmount)} refunded.`, tone: 'success' };
    case 'partial':
      return { message: `${subjectLabel} cancelled — ${formatCurrency(outcome.refundedAmount)} refunded automatically; ${formatCurrency(outcome.remainingAmount)} will be refunded manually by the treasurer.`, tone: 'warning' };
    case 'manual':
      return { message: `${subjectLabel} cancelled — the payment will be refunded manually by the treasurer.`, tone: 'warning' };
    case 'failed':
      return { message: `${subjectLabel} cancelled, but the automatic refund failed — the treasurer has been notified to process it manually.`, tone: 'error' };
  }
}

/**
 * Cancelling a whole registration refunds each of its active item
 * selections separately (one RefundOutcome per item), which can land on
 * different outcomes (e.g. one item's charge refunds fine, another's
 * doesn't). Collapse them into the single worst-case outcome so the overall
 * cancellation message doesn't overstate success.
 */
export function combineRefundOutcomes(outcomes: RefundOutcome[]): RefundOutcome {
  const meaningful = outcomes.filter((o) => o.status !== 'none');
  if (meaningful.length === 0) return { status: 'none' };

  const refundedAmount = meaningful.reduce((sum, o) => sum + ('refundedAmount' in o ? o.refundedAmount : 0), 0);

  if (meaningful.some((o) => o.status === 'failed')) {
    return { status: 'failed', error: 'One or more refunds could not be processed automatically.', refundedAmount };
  }
  if (meaningful.some((o) => o.status === 'manual' || o.status === 'partial')) {
    const remainingAmount = meaningful.reduce((sum, o) => sum + (o.status === 'partial' ? o.remainingAmount : 0), 0);
    if (refundedAmount > 0) {
      return { status: 'partial', refundedAmount, remainingAmount, note: '' };
    }
    return { status: 'manual', note: 'The payment will be refunded manually by the treasurer.' };
  }
  return { status: 'refunded', refundedAmount };
}
