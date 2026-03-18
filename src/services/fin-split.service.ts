import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finSplitService = {
  async createSplits(
    transactionId: string,
    splits: Array<{
      categoryId?: string;
      amount: number;
      accountName?: string;
      eventId?: string;
      memberId?: string;
      notes?: string;
    }>,
  ) {
    const txn = await prisma.finRawTransaction.findUnique({ where: { id: transactionId } });
    if (!txn) throw new Error('Transaction not found');

    // Validate split amounts sum to netAmount
    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    const netAmount = Number(txn.netAmount);
    if (Math.abs(splitTotal - netAmount) > 0.01) {
      throw new Error(`Split amounts (${splitTotal.toFixed(2)}) must equal transaction net amount (${netAmount.toFixed(2)})`);
    }

    // Delete existing splits
    await prisma.finTransactionSplit.deleteMany({ where: { transactionId } });

    // Create new splits
    const created = [];
    for (const split of splits) {
      const record = await prisma.finTransactionSplit.create({
        data: {
          transactionId,
          categoryId: split.categoryId ?? null,
          amount: new Prisma.Decimal(split.amount),
          accountName: split.accountName ?? null,
          eventId: split.eventId ?? null,
          memberId: split.memberId ?? null,
          notes: split.notes ?? null,
        },
      });
      created.push(record);
    }

    return created;
  },

  async getSplits(transactionId: string) {
    return prisma.finTransactionSplit.findMany({
      where: { transactionId },
      include: { category: true },
    });
  },

  async deleteSplits(transactionId: string) {
    await prisma.finTransactionSplit.deleteMany({ where: { transactionId } });
  },
};
