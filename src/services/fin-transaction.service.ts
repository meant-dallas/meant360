import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { fetchSquareTransactions } from '@/lib/square';
import { fetchPayPalTransactions } from '@/lib/paypal';
import { buildFinTransactionWhere, summarizeGrossFeeNet, resolveCategoryId, FIN_TXN_INCLUDE } from '@/services/fin-summary.service';

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
    // Same event-filter semantics (split-aware, with parent fallback) as the
    // dashboard/reports summaries — this is what fixes the Transactions page
    // under/over-counting a filtered event's totals when transactions are split.
    const baseWhere = buildFinTransactionWhere({
      status: filters.status,
      type: filters.type,
      excluded: filters.excluded,
      startDate: filters.startDate,
      endDate: filters.endDate,
      eventId: filters.eventId,
    });
    if (filters.provider) baseWhere.provider = filters.provider;

    const categoryWhere: Prisma.FinRawTransactionWhereInput | null = filters.categoryId
      ? {
          OR: [
            { splits: { none: {} }, categoryId: filters.categoryId },
            { splits: { some: { categoryId: filters.categoryId } } },
          ],
        }
      : null;

    const where: Prisma.FinRawTransactionWhereInput = categoryWhere
      ? { AND: [baseWhere, categoryWhere] }
      : baseWhere;

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const sortableFields = ['transactionDate', 'grossAmount', 'fee', 'netAmount', 'provider', 'description', 'status', 'payerName'] as const;
    const sortBy = sortableFields.includes(filters.sortBy as typeof sortableFields[number])
      ? (filters.sortBy as typeof sortableFields[number])
      : 'transactionDate';
    const sortOrder = filters.sortOrder ?? 'desc';

    const [data, total, allMatching] = await Promise.all([
      prisma.finRawTransaction.findMany({
        where,
        include: FIN_TXN_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.finRawTransaction.count({ where }),
      prisma.finRawTransaction.findMany({ where, include: FIN_TXN_INCLUDE }),
    ]);

    const { sumGross, sumFee, sumNet } = summarizeGrossFeeNet(allMatching, {
      eventId: filters.eventId,
      categoryId: filters.categoryId,
    });

    return {
      data, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
      sumGross, sumFee, sumNet,
    };
  },

  async getById(id: string) {
    return prisma.finRawTransaction.findUnique({
      where: { id },
      include: FIN_TXN_INCLUDE,
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

  /**
   * Record an event/membership payment on the ledger — the single write path
   * used by every "someone paid us" flow (event registration, check-in,
   * membership renewal/approval), replacing what used to be a separate
   * legacy Income row.
   *
   * Card payments (Square/PayPal/Reader) already reach the ledger via
   * `logFinTransaction` in payments.service.ts at charge time, tagged with
   * `externalId`. When `transactionId` matches one of those, this just backs
   * that existing row with the event/category if it's missing one, rather
   * than creating a second entry for the same money. Cash/check/manual
   * payments never go through that path, so this is the only place they're
   * recorded — a brand-new manual transaction is created for them.
   */
  async recordOrLinkEventPayment(opts: {
    eventId?: string;
    amount: number;
    payerName?: string;
    description: string;
    transactionId?: string;
    memberId?: string;
    categoryCode: string;
    categoryFallbackName: string;
  }): Promise<string | null> {
    if (opts.amount <= 0) return null;

    if (opts.transactionId) {
      const existing = await prisma.finRawTransaction.findUnique({ where: { externalId: opts.transactionId } });
      if (existing) {
        const needsEventId = !existing.eventId && !!opts.eventId;
        const needsCategory = !existing.categoryId;
        if (needsEventId || needsCategory) {
          const categoryId = needsCategory
            ? await resolveCategoryId(opts.categoryCode, opts.categoryFallbackName)
            : existing.categoryId;
          await prisma.finRawTransaction.update({
            where: { id: existing.id },
            data: {
              eventId: needsEventId ? opts.eventId : existing.eventId,
              categoryId,
            },
          });
        }
        return existing.id;
      }
    }

    const categoryId = await resolveCategoryId(opts.categoryCode, opts.categoryFallbackName);
    const created = await prisma.finRawTransaction.create({
      data: {
        provider: 'manual',
        type: 'income',
        grossAmount: new Prisma.Decimal(opts.amount),
        fee: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(opts.amount),
        payerName: opts.payerName || null,
        description: opts.description,
        transactionDate: new Date(),
        status: 'Completed',
        categoryId,
        eventId: opts.eventId ?? null,
        memberId: opts.memberId ?? null,
      },
    });
    return created.id;
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
    const isLifeMembership = txn.category?.code === 'life_membership' || txn.category?.name === 'Life Membership';
    if (!isLifeMembership) {
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

    // Create income split (inherits the parent's event, if any)
    await prisma.finTransactionSplit.create({
      data: {
        transactionId,
        categoryId: txn.categoryId!,
        amount: new Prisma.Decimal(incomePortion),
        eventId: txn.eventId ?? null,
        notes: `Income portion ($${incomePortion})`,
      },
    });

    // Create Savings split
    await prisma.finTransactionSplit.create({
      data: {
        transactionId,
        amount: new Prisma.Decimal(savingsPortion),
        accountName: 'Savings Account',
        eventId: txn.eventId ?? null,
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

      // Safe to advance by +1 day because fetchPayPalTransactions sends
      // T00:00:00Z / T23:59:59Z, so chunk N covers the full UTC day of
      // effectiveEnd and chunk N+1 picks up cleanly at midnight the next day.
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
