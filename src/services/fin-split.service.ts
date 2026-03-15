import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finSplitService = {
  async createSplits(
    transactionId: string,
    splits: Array<{
      categoryId?: string;
      amount: number;
      eventId?: string;
      memberId?: string;
      notes?: string;
    }>,
  ) {
    const txn = await prisma.finRawTransaction.findUnique({ where: { id: transactionId } });
    if (!txn) throw new Error('Transaction not found');

    // Validate split amounts sum to grossAmount
    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    const grossAmount = Number(txn.grossAmount);
    if (Math.abs(splitTotal - grossAmount) > 0.01) {
      throw new Error(`Split amounts (${splitTotal.toFixed(2)}) must equal transaction gross amount (${grossAmount.toFixed(2)})`);
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
          eventId: split.eventId ?? null,
          memberId: split.memberId ?? null,
          notes: split.notes ?? null,
        },
      });
      created.push(record);
    }

    // Update transaction status
    await prisma.finRawTransaction.update({
      where: { id: transactionId },
      data: { status: 'SPLIT' },
    });

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
    // Revert status to CLASSIFIED
    await prisma.finRawTransaction.update({
      where: { id: transactionId },
      data: { status: 'CLASSIFIED' },
    });
  },
};
