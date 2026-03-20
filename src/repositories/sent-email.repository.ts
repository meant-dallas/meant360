import { prisma } from '@/lib/db';

export const sentEmailRepository = {
  async create(data: {
    to: string;
    subject: string;
    body: string;
    provider: string;
    status: string;
    error?: string;
    sentBy: string;
  }) {
    return prisma.sentEmail.create({ data });
  },

  async countTodayByProvider(provider: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return prisma.sentEmail.count({
      where: {
        provider,
        status: 'sent',
        sentAt: { gte: startOfDay },
      },
    });
  },

  async countLastHourByProvider(provider: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return prisma.sentEmail.count({
      where: {
        provider,
        status: 'sent',
        sentAt: { gte: oneHourAgo },
      },
    });
  },

  async findAll(limit = 50) {
    return prisma.sentEmail.findMany({
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  },
};
