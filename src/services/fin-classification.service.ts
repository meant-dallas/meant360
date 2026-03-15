import { prisma } from '@/lib/db';

export const finClassificationService = {
  async classify(transactionIds: string[], categoryId: string, eventId?: string) {
    const result = await prisma.finRawTransaction.updateMany({
      where: {
        id: { in: transactionIds },
        status: 'NEW',
      },
      data: {
        categoryId,
        eventId: eventId ?? undefined,
        status: 'CLASSIFIED',
      },
    });
    return { updated: result.count };
  },

  async reclassify(transactionId: string, categoryId: string, eventId?: string) {
    return prisma.finRawTransaction.update({
      where: { id: transactionId },
      data: {
        categoryId,
        eventId: eventId ?? undefined,
        status: 'CLASSIFIED',
      },
    });
  },
};
