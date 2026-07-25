// ========================================
// Registration ledger — refund matching
// ========================================
//
// A registration can be paid across multiple provider captures over its
// lifetime — the initial registration payment, plus a separate capture for
// each "pay more" edit (adding a performer, more attendees, etc). Refunding
// against a single stored transactionId after several edits could try to
// refund more than that specific capture ever held. This module computes,
// from the full ledger (see registration-ledger.repository.ts), how much of
// each individual charge is still unrefunded, so refund logic can walk it
// and match amounts to the capture that actually has them.

export interface LedgerEntry {
  type: string; // 'registered' | 'edited' | 'charge' | 'refund' | 'cancelled'
  method?: string;
  transactionId?: string;
  amount?: string;
  refundsTransactionId?: string; // set on 'refund' entries — the transactionId of the charge it refunds
}

export interface RefundableCharge {
  transactionId: string;
  method: string;
  /** Amount of this specific charge not yet covered by a linked refund entry. */
  remaining: number;
}

/**
 * For each charge in the ledger, subtract any refund entries linked to it
 * (via refundsTransactionId) and return charges that still have money left
 * to refund, oldest first (so a full refund walks captures in the order
 * they were charged).
 */
export function remainingRefundableCharges(entries: LedgerEntry[]): RefundableCharge[] {
  const charges = entries.filter((e) => e.type === 'charge');
  return charges
    .map((c) => {
      const refunded = entries
        .filter((e) => e.type === 'refund' && e.refundsTransactionId === c.transactionId)
        .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
      return {
        transactionId: c.transactionId || '',
        method: c.method || '',
        remaining: Math.max(0, parseFloat(c.amount || '0') - refunded),
      };
    })
    .filter((c) => c.remaining > 0.001);
}
