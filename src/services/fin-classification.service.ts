import { prisma } from '@/lib/db';

export const finClassificationService = {
  async classify(transactionIds: string[], categoryId: string, eventId?: string) {
    // Use individual updates instead of updateMany to avoid implicit transactions
    // (PrismaNeonHttp does not support transactions)
    let updated = 0;
    for (const id of transactionIds) {
      const txn = await prisma.finRawTransaction.findUnique({ where: { id }, select: { status: true } });
      if (!txn || txn.status !== 'NEW') continue;

      await prisma.finRawTransaction.update({
        where: { id },
        data: {
          categoryId,
          eventId: eventId ?? null,
          status: 'CLASSIFIED',
        },
      });
      updated++;
    }
    return { updated };
  },

  async reclassify(transactionId: string, categoryId: string, eventId?: string) {
    return prisma.finRawTransaction.update({
      where: { id: transactionId },
      data: {
        categoryId,
        eventId: eventId ?? null,
        status: 'CLASSIFIED',
      },
    });
  },
};
