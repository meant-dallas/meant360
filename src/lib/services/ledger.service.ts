import { prisma } from '@/lib/db';

export type CreateLedgerEntryInput = {
  type: 'INCOME' | 'EXPENSE' | 'FEE' | 'TRANSFER' | 'REFUND';
  source: 'MEMBERSHIP' | 'EVENT' | 'SPONSOR' | 'DONATION' | 'REIMBURSEMENT' | 'ADJUSTMENT';
  amount: number;
  paymentMethod?: 'PAYPAL' | 'ZELLE' | 'SQUARE' | 'CASH' | 'CHECK' | 'BANK' | null;
  fee?: number | null;
  date?: Date;
  referenceId?: string | null;
  referenceType?: 'INCOME' | 'EXPENSE' | 'SPONSOR' | 'TRANSACTION' | null;
  notes?: string | null;
};

/**
 * Create a ledger entry. Computes netAmount when fee is provided (netAmount = amount - fee).
 */
export async function createLedgerEntry(data: CreateLedgerEntryInput) {
  const date = data.date ?? new Date();
  const fee = data.fee ?? null;
  const netAmount =
    fee != null ? data.amount - fee : data.amount;

  return prisma.ledgerEntry.create({
    data: {
      date,
      type: data.type,
      source: data.source,
      amount: data.amount,
      fee: fee ?? undefined,
      netAmount,
      paymentMethod: data.paymentMethod ?? undefined,
      referenceId: data.referenceId ?? undefined,
      referenceType: data.referenceType ?? undefined,
      notes: data.notes ?? undefined,
    },
  });
}
