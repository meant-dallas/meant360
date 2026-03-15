import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export interface TransactionFilters {
  status?: string;
  provider?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  reconciled?: boolean;
  categoryId?: string;
  eventId?: string;
  page?: number;
  pageSize?: number;
}

export const finTransactionService = {
  async list(filters: TransactionFilters = {}) {
    const where: Prisma.FinRawTransactionWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.provider) where.provider = filters.provider;
    if (filters.type) where.type = filters.type;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.reconciled !== undefined) where.reconciled = filters.reconciled;

    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) where.transactionDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.transactionDate.lte = new Date(filters.endDate + 'T23:59:59Z');
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const [data, total] = await Promise.all([
      prisma.finRawTransaction.findMany({
        where,
        include: { category: true, event: true },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.finRawTransaction.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getById(id: string) {
    return prisma.finRawTransaction.findUnique({
      where: { id },
      include: { category: true, event: true, splits: { include: { category: true } }, reconcileGroup: true },
    });
  },

  async create(data: {
    provider: string;
    type: string;
    grossAmount: number;
    fee?: number;
    netAmount?: number;
    currency?: string;
    payerName?: string;
    payerEmail?: string;
    description?: string;
    transactionDate: string;
    categoryId?: string;
    eventId?: string;
    memberId?: string;
    notes?: string;
    externalId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const fee = data.fee ?? 0;
    const netAmount = data.netAmount ?? data.grossAmount - fee;
    const status = data.categoryId ? 'CLASSIFIED' : 'NEW';

    return prisma.finRawTransaction.create({
      data: {
        provider: data.provider,
        externalId: data.externalId ?? null,
        type: data.type,
        grossAmount: new Prisma.Decimal(data.grossAmount),
        fee: new Prisma.Decimal(fee),
        netAmount: new Prisma.Decimal(netAmount),
        currency: data.currency ?? 'USD',
        payerName: data.payerName ?? null,
        payerEmail: data.payerEmail ?? null,
        description: data.description ?? null,
        transactionDate: new Date(data.transactionDate),
        metadata: data.metadata ?? Prisma.JsonNull,
        status,
        categoryId: data.categoryId ?? null,
        eventId: data.eventId ?? null,
        memberId: data.memberId ?? null,
        notes: data.notes ?? null,
      },
    });
  },

  async update(id: string, data: {
    categoryId?: string | null;
    eventId?: string | null;
    memberId?: string | null;
    notes?: string;
    description?: string;
  }) {
    return prisma.finRawTransaction.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.finRawTransaction.delete({ where: { id } });
  },

  async importBankRows(rows: Array<{ date: string; description?: string; amount: number; reference?: string }>) {
    const results = [];
    for (const row of rows) {
      const isDeposit = row.amount >= 0;
      const txn = await prisma.finRawTransaction.create({
        data: {
          provider: 'bank',
          type: isDeposit ? 'deposit' : 'withdrawal',
          grossAmount: new Prisma.Decimal(row.amount),
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(row.amount),
          transactionDate: new Date(row.date),
          description: row.description ?? null,
          status: 'NEW',
        },
      });

      await prisma.finBankDeposit.create({
        data: {
          date: new Date(row.date),
          description: row.description ?? null,
          amount: new Prisma.Decimal(row.amount),
          reference: row.reference ?? null,
          rawData: row as unknown as Prisma.InputJsonValue,
          transactionId: txn.id,
        },
      });

      results.push(txn);
    }
    return results;
  },

  async getStats() {
    const [needsReview, categorized, recorded, verified, total] = await Promise.all([
      prisma.finRawTransaction.count({ where: { status: 'NEW' } }),
      prisma.finRawTransaction.count({ where: { status: { in: ['CLASSIFIED', 'SPLIT'] } } }),
      prisma.finRawTransaction.count({ where: { status: 'LEDGERED' } }),
      prisma.finRawTransaction.count({ where: { status: 'RECONCILED' } }),
      prisma.finRawTransaction.count(),
    ]);
    return { needsReview, categorized, recorded, verified, total };
  },
};
