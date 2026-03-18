import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { fetchSquareTransactions } from '@/lib/square';
import { fetchPayPalTransactions } from '@/lib/paypal';

export interface TransactionFilters {
  status?: string;
  provider?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  eventId?: string;
  excluded?: boolean;
  page?: number;
  pageSize?: number;
}

// Life membership settings
const LIFE_MEMBERSHIP_INCOME_PORTION = 125;

export const finTransactionService = {
  async list(filters: TransactionFilters = {}) {
    const where: Prisma.FinRawTransactionWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.provider) where.provider = filters.provider;
    if (filters.type) where.type = filters.type;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.excluded !== undefined) where.excluded = filters.excluded;

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
        include: { category: true, event: true, splits: { include: { category: true } } },
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
      include: { category: true, event: true, splits: { include: { category: true } } },
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
    status?: string;
    categoryId?: string;
    eventId?: string;
    memberId?: string;
    notes?: string;
    externalId?: string;
    excluded?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    const fee = data.fee ?? 0;
    const netAmount = data.netAmount ?? data.grossAmount - fee;

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
        status: data.status ?? 'Completed',
        categoryId: data.categoryId ?? null,
        eventId: data.eventId ?? null,
        memberId: data.memberId ?? null,
        notes: data.notes ?? null,
        excluded: data.excluded ?? false,
      },
    });
  },

  async update(id: string, data: {
    categoryId?: string | null;
    eventId?: string | null;
    memberId?: string | null;
    notes?: string;
    description?: string;
    excluded?: boolean;
    status?: string;
    type?: string;
    grossAmount?: number;
    fee?: number;
  }) {
    const txn = await prisma.finRawTransaction.findUnique({ where: { id } });
    if (!txn) throw new Error('Transaction not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.eventId !== undefined) updateData.eventId = data.eventId;
    if (data.memberId !== undefined) updateData.memberId = data.memberId;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.excluded !== undefined) updateData.excluded = data.excluded;

    // Only allow status/type/amount edits on manual transactions
    if (txn.provider === 'manual') {
      if (data.status !== undefined) updateData.status = data.status;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.grossAmount !== undefined) {
        const fee = data.fee ?? Number(txn.fee);
        updateData.grossAmount = new Prisma.Decimal(data.grossAmount);
        updateData.fee = new Prisma.Decimal(fee);
        updateData.netAmount = new Prisma.Decimal(data.grossAmount - fee);
      }
    }

    return prisma.finRawTransaction.update({ where: { id }, data: updateData });
  },

  async delete(id: string) {
    // Delete splits first
    await prisma.finTransactionSplit.deleteMany({ where: { transactionId: id } });
    return prisma.finRawTransaction.delete({ where: { id } });
  },

  async categorize(transactionIds: string[], categoryId: string, eventId?: string) {
    let updated = 0;
    for (const id of transactionIds) {
      await prisma.finRawTransaction.update({
        where: { id },
        data: {
          categoryId,
          eventId: eventId ?? null,
        },
      });
      updated++;
    }
    return { updated };
  },

  async splitLifeMembership(transactionId: string) {
    const txn = await prisma.finRawTransaction.findUnique({
      where: { id: transactionId },
      include: { category: true },
    });
    if (!txn) throw new Error('Transaction not found');
    if (!txn.category || txn.category.name !== 'Life Membership') {
      throw new Error('This transaction is not a Life Membership payment');
    }

    const grossAmount = Number(txn.grossAmount);
    const incomePortion = LIFE_MEMBERSHIP_INCOME_PORTION;
    const savingsPortion = grossAmount - incomePortion;

    if (savingsPortion <= 0) {
      throw new Error('Transaction amount must be greater than $125 to split');
    }

    // Delete existing splits
    await prisma.finTransactionSplit.deleteMany({ where: { transactionId } });

    // Create income split
    await prisma.finTransactionSplit.create({
      data: {
        transactionId,
        categoryId: txn.categoryId!,
        amount: new Prisma.Decimal(incomePortion),
        notes: `Income portion ($${incomePortion})`,
      },
    });

    // Create Savings split
    await prisma.finTransactionSplit.create({
      data: {
        transactionId,
        amount: new Prisma.Decimal(savingsPortion),
        accountName: 'Savings Account',
        notes: `Savings portion ($${savingsPortion})`,
      },
    });

    return { incomePortion, savingsPortion };
  },

  async getStats() {
    const [completed, pending, uncategorized, total] = await Promise.all([
      prisma.finRawTransaction.count({ where: { status: 'Completed' } }),
      prisma.finRawTransaction.count({ where: { status: 'Pending' } }),
      prisma.finRawTransaction.count({ where: { categoryId: null } }),
      prisma.finRawTransaction.count(),
    ]);
    return { completed, pending, uncategorized, total };
  },

  async syncSquare(startDate: string, endDate: string) {
    const legacyTxns = await fetchSquareTransactions(startDate, endDate);
    let imported = 0;
    let skipped = 0;

    for (const txn of legacyTxns) {
      if (!txn.externalId) continue;

      const existing = await prisma.finRawTransaction.findUnique({
        where: { externalId: txn.externalId },
      });
      if (existing) { skipped++; continue; }

      await prisma.finRawTransaction.create({
        data: {
          provider: 'square',
          externalId: txn.externalId,
          type: 'income',
          grossAmount: new Prisma.Decimal(txn.amount),
          fee: new Prisma.Decimal(txn.fee),
          netAmount: new Prisma.Decimal(txn.netAmount),
          payerName: txn.payerName || null,
          payerEmail: txn.payerEmail || null,
          description: txn.description || null,
          transactionDate: new Date(txn.date),
          metadata: { squareOrderId: txn.externalId, notes: txn.notes } as Prisma.InputJsonValue,
          status: 'Completed',
        },
      });
      imported++;
    }

    return { imported, skipped, total: legacyTxns.length };
  },

  async syncPayPal(startDate: string, endDate: string) {
    const allTxns = [];
    let chunkStart = new Date(startDate);
    const finalEnd = new Date(endDate);

    while (chunkStart <= finalEnd) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 30);
      const effectiveEnd = chunkEnd > finalEnd ? finalEnd : chunkEnd;

      const chunk = await fetchPayPalTransactions(
        chunkStart.toISOString().slice(0, 10),
        effectiveEnd.toISOString().slice(0, 10),
      );
      allTxns.push(...chunk);

      chunkStart = new Date(effectiveEnd);
      chunkStart.setDate(chunkStart.getDate() + 1);
    }

    let imported = 0;
    let skipped = 0;

    for (const txn of allTxns) {
      if (!txn.externalId) continue;

      const existing = await prisma.finRawTransaction.findUnique({
        where: { externalId: txn.externalId },
      });
      if (existing) { skipped++; continue; }

      await prisma.finRawTransaction.create({
        data: {
          provider: 'paypal',
          externalId: txn.externalId,
          type: 'income',
          grossAmount: new Prisma.Decimal(txn.amount),
          fee: new Prisma.Decimal(txn.fee),
          netAmount: new Prisma.Decimal(txn.netAmount),
          payerName: txn.payerName || null,
          payerEmail: txn.payerEmail || null,
          description: txn.description || null,
          transactionDate: new Date(txn.date),
          metadata: { paypalTransactionId: txn.externalId, notes: txn.notes } as Prisma.InputJsonValue,
          status: 'Completed',
        },
      });
      imported++;
    }

    return { imported, skipped, total: allTxns.length };
  },

  async importZelleRows(rows: Array<{ date: string; description?: string; amount: number; type?: string }>) {
    const results = [];
    for (const row of rows) {
      const txn = await prisma.finRawTransaction.create({
        data: {
          provider: 'zelle',
          type: row.type || (row.amount >= 0 ? 'income' : 'expense'),
          grossAmount: new Prisma.Decimal(row.amount),
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(row.amount),
          transactionDate: new Date(row.date),
          description: row.description ?? null,
          status: 'Completed',
        },
      });
      results.push(txn);
    }
    return results;
  },
};
