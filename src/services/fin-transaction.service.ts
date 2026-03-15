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

  async syncSquare(startDate: string, endDate: string) {
    const legacyTxns = await fetchSquareTransactions(startDate, endDate);
    let imported = 0;
    let skipped = 0;

    for (const txn of legacyTxns) {
      if (!txn.externalId) continue;

      // Skip if already imported (dedup by externalId)
      const existing = await prisma.finRawTransaction.findUnique({
        where: { externalId: txn.externalId },
      });
      if (existing) { skipped++; continue; }

      // Create payment row
      await prisma.finRawTransaction.create({
        data: {
          provider: 'square',
          externalId: txn.externalId,
          type: 'payment',
          grossAmount: new Prisma.Decimal(txn.amount),
          fee: new Prisma.Decimal(txn.fee),
          netAmount: new Prisma.Decimal(txn.netAmount),
          payerName: txn.payerName || null,
          payerEmail: txn.payerEmail || null,
          description: txn.description || null,
          transactionDate: new Date(txn.date),
          metadata: { squareOrderId: txn.externalId, notes: txn.notes } as Prisma.InputJsonValue,
          status: 'NEW',
        },
      });
      imported++;

      // Create separate fee row if fee > 0
      if (txn.fee > 0) {
        await prisma.finRawTransaction.create({
          data: {
            provider: 'square',
            externalId: `${txn.externalId}_fee`,
            type: 'fee',
            grossAmount: new Prisma.Decimal(-txn.fee),
            fee: new Prisma.Decimal(0),
            netAmount: new Prisma.Decimal(-txn.fee),
            description: `Processing Fee - ${txn.description || 'Square'}`,
            transactionDate: new Date(txn.date),
            status: 'NEW',
          },
        });
      }
    }

    return { imported, skipped, total: legacyTxns.length };
  },

  async syncPayPal(startDate: string, endDate: string) {
    // PayPal API limits search to 31-day windows; chunk if needed
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

    const legacyTxns = allTxns;
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
          provider: 'paypal',
          externalId: txn.externalId,
          type: 'payment',
          grossAmount: new Prisma.Decimal(txn.amount),
          fee: new Prisma.Decimal(txn.fee),
          netAmount: new Prisma.Decimal(txn.netAmount),
          payerName: txn.payerName || null,
          payerEmail: txn.payerEmail || null,
          description: txn.description || null,
          transactionDate: new Date(txn.date),
          metadata: { paypalTransactionId: txn.externalId, notes: txn.notes } as Prisma.InputJsonValue,
          status: 'NEW',
        },
      });
      imported++;

      if (txn.fee > 0) {
        await prisma.finRawTransaction.create({
          data: {
            provider: 'paypal',
            externalId: `${txn.externalId}_fee`,
            type: 'fee',
            grossAmount: new Prisma.Decimal(-txn.fee),
            fee: new Prisma.Decimal(0),
            netAmount: new Prisma.Decimal(-txn.fee),
            description: `Processing Fee - ${txn.description || 'PayPal'}`,
            transactionDate: new Date(txn.date),
            status: 'NEW',
          },
        });
      }
    }

    return { imported, skipped, total: legacyTxns.length };
  },
};
