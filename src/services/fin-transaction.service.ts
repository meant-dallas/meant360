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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Life membership settings
const LIFE_MEMBERSHIP_INCOME_PORTION = 125;

export const finTransactionService = {
  async list(filters: TransactionFilters = {}) {
    // Base where: all filters EXCEPT category (used for accurate aggregate sums)
    const baseWhere: Prisma.FinRawTransactionWhereInput = {};

    if (filters.status) baseWhere.status = filters.status;
    if (filters.provider) baseWhere.provider = filters.provider;
    if (filters.type) baseWhere.type = filters.type;
    if (filters.eventId) baseWhere.eventId = filters.eventId;
    if (filters.excluded !== undefined) baseWhere.excluded = filters.excluded;

    if (filters.startDate || filters.endDate) {
      baseWhere.transactionDate = {};
      if (filters.startDate) baseWhere.transactionDate.gte = new Date(filters.startDate);
      if (filters.endDate) baseWhere.transactionDate.lte = new Date(filters.endDate + 'T23:59:59Z');
    }

    // Full where: includes category filter for listing/counting
    const where: Prisma.FinRawTransactionWhereInput = { ...baseWhere };
    if (filters.categoryId) {
      where.OR = [
        { splits: { none: {} }, categoryId: filters.categoryId },
        { splits: { some: { categoryId: filters.categoryId } } },
      ];
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const sortableFields = ['transactionDate', 'grossAmount', 'fee', 'netAmount', 'provider', 'description', 'status', 'payerName'] as const;
    const sortBy = sortableFields.includes(filters.sortBy as typeof sortableFields[number])
      ? (filters.sortBy as typeof sortableFields[number])
      : 'transactionDate';
    const sortOrder = filters.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      prisma.finRawTransaction.findMany({
        where,
        include: { category: true, event: true, splits: { include: { category: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.finRawTransaction.count({ where }),
    ]);

    // Compute type-aware sums (refunds are negative income, not positive)
    let sumGross = 0;
    let sumFee = 0;
    let sumNet = 0;

    if (filters.categoryId) {
      // Category filter: need non-split txns + matching splits
      const [nonSplitTxns, matchingSplits] = await Promise.all([
        prisma.finRawTransaction.findMany({
          where: { ...baseWhere, splits: { none: {} }, categoryId: filters.categoryId },
          select: { type: true, grossAmount: true, fee: true, netAmount: true },
        }),
        prisma.finTransactionSplit.findMany({
          where: {
            categoryId: filters.categoryId,
            transaction: baseWhere,
          },
          select: { amount: true, transaction: { select: { type: true } } },
        }),
      ]);
      for (const t of nonSplitTxns) {
        const sign = t.type === 'refund' ? -1 : 1;
        sumGross += sign * Math.abs(Number(t.grossAmount));
        sumFee += Number(t.fee);
        sumNet += sign * Math.abs(Number(t.netAmount));
      }
      for (const s of matchingSplits) {
        const sign = s.transaction.type === 'refund' ? -1 : 1;
        const amt = Math.abs(Number(s.amount));
        sumGross += sign * amt;
        sumNet += sign * amt;
      }
    } else {
      // No category filter: fetch all matching txns for type-aware sums
      const allTxns = await prisma.finRawTransaction.findMany({
        where,
        select: { type: true, grossAmount: true, fee: true, netAmount: true },
      });
      for (const t of allTxns) {
        const sign = t.type === 'refund' ? -1 : 1;
        sumGross += sign * Math.abs(Number(t.grossAmount));
        sumFee += Number(t.fee);
        sumNet += sign * Math.abs(Number(t.netAmount));
      }
    }

    return {
      data, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
      sumGross, sumFee, sumNet,
    };
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

    const netAmount = Number(txn.netAmount);
    const incomePortion = LIFE_MEMBERSHIP_INCOME_PORTION;
    const savingsPortion = netAmount - incomePortion;

    if (savingsPortion <= 0) {
      throw new Error('Net amount must be greater than $125 to split');
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
    let updated = 0;

    for (const txn of legacyTxns) {
      if (!txn.externalId) continue;

      const existing = await prisma.finRawTransaction.findUnique({
        where: { externalId: txn.externalId },
      });

      if (existing) {
        const existingGross = Number(existing.grossAmount);
        const existingFee = Number(existing.fee);
        const grossDiffers = Math.abs(existingGross - txn.amount) > 0.01;
        const feeDiffers = Math.abs(existingFee - txn.fee) > 0.01;
        const descriptionBetter = txn.description && txn.description !== 'Square Payment'
          && (!existing.description || existing.description.startsWith('Event Entry:') || existing.description.startsWith('Membership:'));

        if (grossDiffers || feeDiffers || descriptionBetter) {
          const updateData: Record<string, unknown> = {};
          if (grossDiffers || feeDiffers) {
            updateData.grossAmount = new Prisma.Decimal(txn.amount);
            updateData.fee = new Prisma.Decimal(txn.fee);
            updateData.netAmount = new Prisma.Decimal(txn.netAmount);
          }
          if (descriptionBetter) {
            updateData.description = txn.description;
          }
          await prisma.finRawTransaction.update({
            where: { id: existing.id },
            data: updateData,
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

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
          metadata: { squarePaymentId: txn.externalId, notes: txn.notes } as Prisma.InputJsonValue,
          status: 'Completed',
        },
      });
      imported++;
    }

    return { imported, skipped, updated, total: legacyTxns.length };
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
    let updated = 0;

    for (const txn of allTxns) {
      if (!txn.externalId) continue;

      const existing = await prisma.finRawTransaction.findUnique({
        where: { externalId: txn.externalId },
      });

      if (existing) {
        const existingGross = Number(existing.grossAmount);
        const existingFee = Number(existing.fee);
        const grossDiffers = Math.abs(existingGross - txn.amount) > 0.01;
        const feeDiffers = Math.abs(existingFee - txn.fee) > 0.01;
        const descriptionBetter = txn.description && txn.description !== 'PayPal Payment'
          && (!existing.description || existing.description.startsWith('Event Entry:') || existing.description.startsWith('Membership:'));

        if (grossDiffers || feeDiffers || descriptionBetter) {
          const updateData: Record<string, unknown> = {};
          if (grossDiffers || feeDiffers) {
            updateData.grossAmount = new Prisma.Decimal(txn.amount);
            updateData.fee = new Prisma.Decimal(txn.fee);
            updateData.netAmount = new Prisma.Decimal(txn.netAmount);
          }
          if (descriptionBetter) {
            updateData.description = txn.description;
          }
          updateData.metadata = { paypalTransactionId: txn.externalId, notes: txn.notes };
          await prisma.finRawTransaction.update({
            where: { id: existing.id },
            data: updateData,
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      await prisma.finRawTransaction.create({
        data: {
          provider: 'paypal',
          externalId: txn.externalId,
          type: txn.isRefund ? 'refund' : 'income',
          grossAmount: new Prisma.Decimal(txn.isRefund ? -txn.amount : txn.amount),
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

    return { imported, skipped, updated, total: allTxns.length };
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
