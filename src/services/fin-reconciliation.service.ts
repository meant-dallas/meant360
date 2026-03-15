import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finReconciliationService = {
  async create(transactionIds: string[], createdBy: string, notes?: string) {
    // Validate all transactions exist and are unreconciled
    const transactions = await prisma.finRawTransaction.findMany({
      where: { id: { in: transactionIds } },
    });

    if (transactions.length !== transactionIds.length) {
      throw new Error('Some transactions not found');
    }

    const alreadyReconciled = transactions.filter((t) => t.reconciled);
    if (alreadyReconciled.length > 0) {
      throw new Error(`${alreadyReconciled.length} transaction(s) are already reconciled`);
    }

    // Validate zero-sum
    const sum = transactions.reduce((acc, t) => acc + Number(t.grossAmount), 0);
    if (Math.abs(sum) > 0.01) {
      throw new Error(`Transactions do not balance. Sum is ${sum.toFixed(2)}, expected 0.00`);
    }

    // Create reconciliation group
    const group = await prisma.finReconciliationGroup.create({
      data: { createdBy, notes: notes ?? null },
    });

    // Update all transactions
    const now = new Date();
    await prisma.finRawTransaction.updateMany({
      where: { id: { in: transactionIds } },
      data: {
        reconciled: true,
        reconcileGroupId: group.id,
        reconciledAt: now,
        status: 'RECONCILED',
      },
    });

    return { group, transactionCount: transactionIds.length };
  },

  async undo(reconcileGroupId: string) {
    const group = await prisma.finReconciliationGroup.findUnique({
      where: { id: reconcileGroupId },
      include: { transactions: true },
    });

    if (!group) throw new Error('Reconciliation group not found');

    // Revert transactions — set status back to LEDGERED (or CLASSIFIED if they were never ledgered)
    for (const txn of group.transactions) {
      const hasLedgerEntries = await prisma.finLedgerEntry.count({
        where: { sourceTransactionId: txn.id },
      });
      await prisma.finRawTransaction.update({
        where: { id: txn.id },
        data: {
          reconciled: false,
          reconcileGroupId: null,
          reconciledAt: null,
          status: hasLedgerEntries > 0 ? 'LEDGERED' : 'CLASSIFIED',
        },
      });
    }

    await prisma.finReconciliationGroup.delete({ where: { id: reconcileGroupId } });

    return { undone: group.transactions.length };
  },

  async suggestMatch(bankTransactionId: string) {
    const bankTxn = await prisma.finRawTransaction.findUnique({
      where: { id: bankTransactionId },
    });

    if (!bankTxn) throw new Error('Bank transaction not found');
    if (bankTxn.provider !== 'bank') throw new Error('Transaction is not a bank transaction');

    const bankAmount = Number(bankTxn.grossAmount);
    const bankDate = bankTxn.transactionDate;

    // Find unreconciled processor transactions within +/- 3 days
    const startDate = new Date(bankDate);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(bankDate);
    endDate.setDate(endDate.getDate() + 3);

    const candidates = await prisma.finRawTransaction.findMany({
      where: {
        reconciled: false,
        provider: { in: ['square', 'paypal'] },
        transactionDate: { gte: startDate, lte: endDate },
        id: { not: bankTransactionId },
      },
      orderBy: { transactionDate: 'asc' },
    });

    // Try to find a combination that sums to the negative of bankAmount
    // (bank deposit + processor payments/fees should sum to 0)
    const targetSum = -bankAmount;
    const match = findSubsetSum(candidates, targetSum);

    return {
      bankTransaction: bankTxn,
      suggestedIds: match ? match.map((t) => t.id) : [],
      candidates: candidates.map((c) => ({
        id: c.id,
        description: c.description,
        amount: Number(c.grossAmount),
        provider: c.provider,
        type: c.type,
        date: c.transactionDate,
      })),
    };
  },

  async listGroups() {
    return prisma.finReconciliationGroup.findMany({
      include: { transactions: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getGroup(id: string) {
    return prisma.finReconciliationGroup.findUnique({
      where: { id },
      include: { transactions: { include: { category: true } } },
    });
  },

  async getStats() {
    const [unmatched, matched, groups] = await Promise.all([
      prisma.finRawTransaction.count({ where: { reconciled: false, status: { not: 'NEW' } } }),
      prisma.finRawTransaction.count({ where: { reconciled: true } }),
      prisma.finReconciliationGroup.count(),
    ]);
    return { unmatched, matched, groups };
  },
};

// Simple subset sum finder for small sets (up to ~20 candidates)
function findSubsetSum(
  items: Array<{ id: string; grossAmount: Prisma.Decimal }>,
  target: number,
): Array<{ id: string; grossAmount: Prisma.Decimal }> | null {
  if (items.length === 0) return null;
  if (items.length > 20) return null; // Too many combos — skip

  for (let mask = 1; mask < (1 << items.length); mask++) {
    let sum = 0;
    const subset = [];
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) {
        sum += Number(items[i].grossAmount);
        subset.push(items[i]);
      }
    }
    if (Math.abs(sum - target) < 0.01) {
      return subset;
    }
  }
  return null;
}
