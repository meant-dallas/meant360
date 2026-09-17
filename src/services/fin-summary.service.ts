import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { toNumber } from '@/lib/utils';

// Single source of truth for every "income/expense/net" figure in the app —
// the dashboard, the event detail page, the Reports page, and the
// Transactions page's event/category filter all read through this file so
// they can never disagree about what a given filter includes.

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface TxnScopeFilter extends DateRangeFilter {
  eventId?: string;
  type?: string;
  status?: string; // defaults to 'Completed'
  excluded?: boolean; // defaults to false
}

const FIN_TXN_INCLUDE = {
  category: true,
  event: true,
  splits: { include: { category: true } },
} satisfies Prisma.FinRawTransactionInclude;

type FinTxnWithRelations = Prisma.FinRawTransactionGetPayload<{ include: typeof FIN_TXN_INCLUDE }>;

/**
 * The one place that decides whether a FinRawTransaction row matches an
 * event filter. A transaction can be tagged directly (`eventId`) or through
 * its splits (`FinTransactionSplit.eventId`) — this covers both, plus the
 * case where a transaction has splits but none of them carry an eventId of
 * their own (they then inherit the parent's event).
 */
export function buildFinTransactionWhere(filters: TxnScopeFilter): Prisma.FinRawTransactionWhereInput {
  // No implicit defaults here — a raw listing (e.g. the Transactions page)
  // wants every status/excluded row unless it asks otherwise. Callers that
  // want "Completed, not excluded" as their default (dashboards, reports)
  // apply that themselves before calling this, via withDefaultScope().
  const where: Prisma.FinRawTransactionWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.excluded !== undefined) where.excluded = filters.excluded;
  if (filters.type) where.type = filters.type;
  if (filters.startDate || filters.endDate) {
    where.transactionDate = {};
    if (filters.startDate) where.transactionDate.gte = new Date(filters.startDate);
    if (filters.endDate) where.transactionDate.lte = new Date(filters.endDate + 'T23:59:59Z');
  }
  if (filters.eventId) {
    where.OR = [
      { eventId: filters.eventId, splits: { none: {} } },
      { splits: { some: { eventId: filters.eventId } } },
      // Splits exist but none of them override the event — they inherit the parent's.
      { eventId: filters.eventId, splits: { none: { eventId: { not: null } } } },
    ];
  }
  return where;
}

/** Completed + not-excluded is the right default for any "financial totals" consumer — dashboards, reports, event summaries. */
function withDefaultScope(filters: TxnScopeFilter): TxnScopeFilter {
  return { status: 'Completed', excluded: false, ...filters };
}

async function fetchScopedTransactions(filters: TxnScopeFilter): Promise<FinTxnWithRelations[]> {
  return prisma.finRawTransaction.findMany({
    where: buildFinTransactionWhere(withDefaultScope(filters)),
    include: FIN_TXN_INCLUDE,
    orderBy: { transactionDate: 'asc' },
  });
}

/** A split's effective event: its own eventId, falling back to the parent transaction's. */
function effectiveSplitEventId(split: { eventId: string | null }, parentEventId: string | null): string | null {
  return split.eventId ?? parentEventId;
}

/**
 * Every category is one of four buckets — this is the single source of
 * truth for what counts as Income, Expense, or neither, everywhere in the
 * app. A category's own bucket is authoritative over the raw ledger `type`
 * (income/expense/refund) a transaction happened to sync in as — e.g. a
 * PayPal payout that PayPal itself labels "refund" but which is really a
 * member-reimbursement payout gets bucketed as 'do_not_consider' via its
 * category, not treated as a real refund.
 *
 * do_not_consider exists for money that's already been counted once
 * elsewhere in the ledger (the canonical case: a reimbursement payout
 * re-paying an expense that was already recorded when the member's
 * underlying purchase happened) — counting it again would double it. Rows
 * in this bucket still show up in raw ledger listings (the Transactions
 * page) but never contribute to any total.
 */
export type CategoryBucket = 'income' | 'expense' | 'refund' | 'do_not_consider';
const CATEGORY_BUCKETS = new Set<CategoryBucket>(['income', 'expense', 'refund', 'do_not_consider']);

function categoryBucket(categoryType: string | null | undefined): CategoryBucket | null {
  return categoryType && CATEGORY_BUCKETS.has(categoryType as CategoryBucket) ? (categoryType as CategoryBucket) : null;
}

/**
 * The one rule for which bucket a line item (a whole transaction, or one of
 * its splits) belongs to, and how much it contributes. An uncategorized
 * line item falls back to the transaction's own raw ledger type — meaning
 * 'do_not_consider' is only ever reached via explicit categorization, never
 * as a default, so a forgotten-to-categorize row can't silently vanish.
 */
export function classifyLineItem(
  categoryType: string | null | undefined,
  transactionType: string,
  amount: number,
): { bucket: CategoryBucket; magnitude: number } {
  const bucket = categoryBucket(categoryType) ?? (transactionType === 'refund' ? 'refund' : transactionType === 'expense' ? 'expense' : 'income');
  return { bucket, magnitude: Math.abs(amount) };
}

export interface CategorySummary {
  totalIncome: number;
  totalExpenses: number;
  totalFees: number;
  totalGross: number;
  netIncome: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  uncategorizedCount: number;
}

/**
 * Reduce a set of transactions into income/expense totals, always on a
 * net-of-fee basis whether or not a transaction is split (splits are already
 * defined against netAmount — see fin-split.service.ts — so mixing gross
 * non-split amounts in used to make the total drift depending on the
 * split/non-split mix in a period).
 *
 * When `eventId` is passed, only splits whose effective event matches are
 * counted for split transactions with splits; a category is no longer
 * required for a split/transaction to count toward the total — an
 * event-tagged-but-uncategorized amount is still real money and is bucketed
 * under "Uncategorized" instead of silently disappearing.
 */
export function summarizeByCategory(
  txns: FinTxnWithRelations[],
  opts: { eventId?: string; categoryId?: string } = {},
): CategorySummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalFees = 0;
  let totalGross = 0;
  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};
  let uncategorizedCount = 0;

  const applyLineItem = (
    categoryType: string | null | undefined,
    categoryName: string | null | undefined,
    transactionType: string,
    rawAmount: number,
  ) => {
    const { bucket, magnitude } = classifyLineItem(categoryType, transactionType, rawAmount);
    const catName = categoryName ?? 'Uncategorized';
    if (bucket === 'do_not_consider') return;
    if (bucket === 'refund') {
      // A refund reverses income that was already counted (e.g. a
      // cancelled registration) — it belongs in the Income breakdown as a
      // negative line, not as a new Expense.
      totalIncome -= magnitude;
      incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) - magnitude;
    } else if (bucket === 'income') {
      totalIncome += magnitude;
      incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + magnitude;
    } else {
      totalExpenses += magnitude;
      expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + magnitude;
    }
  };

  for (const t of txns) {
    if (t.splits.length > 0) {
      let anyCounted = false;
      for (const split of t.splits) {
        if (opts.eventId && effectiveSplitEventId(split, t.eventId) !== opts.eventId) continue;
        if (opts.categoryId && split.categoryId !== opts.categoryId) continue;
        anyCounted = true;
        if (!split.categoryId) uncategorizedCount++;
        applyLineItem(split.category?.type, split.category?.name, t.type, toNumber(split.amount));
      }
      if (!anyCounted) continue;
    } else {
      if (opts.eventId && t.eventId !== opts.eventId) continue;
      if (opts.categoryId && t.categoryId !== opts.categoryId) continue;
      if (!t.categoryId) uncategorizedCount++;
      totalFees += toNumber(t.fee);
      totalGross += Math.abs(toNumber(t.grossAmount));
      applyLineItem(t.category?.type, t.category?.name, t.type, toNumber(t.netAmount));
    }
  }

  return {
    totalIncome,
    totalExpenses,
    totalFees,
    totalGross,
    netIncome: totalIncome - totalExpenses,
    incomeByCategory,
    expenseByCategory,
    uncategorizedCount,
  };
}

export interface GrossFeeNetSummary {
  sumGross: number;
  sumFee: number;
  sumNet: number;
}

/**
 * Used by the Transactions page's summary bar — mirrors the raw ledger
 * figures (gross/fee/net), not the fee-adjusted dashboard totals, but uses
 * the same bucket rule as summarizeByCategory: a category's bucket decides
 * the sign (Income adds, Expense/Refund subtract), and 'do_not_consider'
 * rows are left out of the totals entirely, even though they still show up
 * in the row list above this bar.
 */
export function summarizeGrossFeeNet(
  txns: FinTxnWithRelations[],
  opts: { eventId?: string; categoryId?: string } = {},
): GrossFeeNetSummary {
  let sumGross = 0;
  let sumFee = 0;
  let sumNet = 0;

  for (const t of txns) {
    if (t.splits.length > 0) {
      for (const split of t.splits) {
        if (opts.eventId && effectiveSplitEventId(split, t.eventId) !== opts.eventId) continue;
        if (opts.categoryId && split.categoryId !== opts.categoryId) continue;
        const { bucket, magnitude } = classifyLineItem(split.category?.type, t.type, toNumber(split.amount));
        if (bucket === 'do_not_consider') continue;
        const signed = bucket === 'income' ? magnitude : -magnitude;
        sumGross += signed;
        sumNet += signed;
      }
    } else {
      if (opts.eventId && t.eventId !== opts.eventId) continue;
      if (opts.categoryId && t.categoryId !== opts.categoryId) continue;
      const { bucket, magnitude: netMagnitude } = classifyLineItem(t.category?.type, t.type, toNumber(t.netAmount));
      if (bucket === 'do_not_consider') continue;
      const sign = bucket === 'income' ? 1 : -1;
      sumGross += sign * Math.abs(toNumber(t.grossAmount));
      sumFee += toNumber(t.fee);
      sumNet += sign * netMagnitude;
    }
  }

  return { sumGross, sumFee, sumNet };
}

export interface EventBreakdownRow {
  eventId: string;
  eventName: string;
  income: number;
  expense: number;
  profitLoss: number;
}

/** Org-wide per-event P&L for a date range — replaces the old fin-reports.service getEventSummary. */
export async function getEventBreakdown(filters: DateRangeFilter = {}): Promise<EventBreakdownRow[]> {
  const txns = await prisma.finRawTransaction.findMany({
    where: {
      ...buildFinTransactionWhere(withDefaultScope(filters)),
      OR: [
        { eventId: { not: null } },
        { splits: { some: { eventId: { not: null } } } },
      ],
    },
    include: FIN_TXN_INCLUDE,
  });

  const allEvents = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameMap = new Map(allEvents.map((e) => [e.id, e.name]));

  const eventMap = new Map<string, EventBreakdownRow>();
  const addToEvent = (evId: string, bucket: CategoryBucket, magnitude: number) => {
    let row = eventMap.get(evId);
    if (!row) {
      row = { eventId: evId, eventName: eventNameMap.get(evId) ?? 'Unknown Event', income: 0, expense: 0, profitLoss: 0 };
      eventMap.set(evId, row);
    }
    if (bucket === 'income') row.income += magnitude;
    else if (bucket === 'refund') row.income -= magnitude;
    else if (bucket === 'expense') row.expense += magnitude;
  };

  for (const t of txns) {
    if (t.splits.length > 0) {
      for (const split of t.splits) {
        const evId = effectiveSplitEventId(split, t.eventId);
        if (!evId) continue;
        const { bucket, magnitude } = classifyLineItem(split.category?.type, t.type, toNumber(split.amount));
        addToEvent(evId, bucket, magnitude);
      }
    } else if (t.eventId) {
      const { bucket, magnitude } = classifyLineItem(t.category?.type, t.type, toNumber(t.netAmount));
      addToEvent(t.eventId, bucket, magnitude);
    }
  }

  return Array.from(eventMap.values()).map((row) => ({ ...row, profitLoss: row.income - row.expense }));
}

export interface FinancialSummary extends CategorySummary {
  startDate?: string;
  endDate?: string;
  eventId?: string;
  eventBreakdown?: EventBreakdownRow[];
  pendingReceivables?: number;
  pendingPayables?: number;
}

/**
 * The one function that answers "what's the financial picture for X" —
 * org-wide when `eventId` is omitted, scoped to one event otherwise. Backs
 * the Accounting dashboard's top-level cards and (scoped) its event pane,
 * the Event Detail page's stat card, and the Reports page.
 */
export async function getFinancialSummary(filters: TxnScopeFilter = {}): Promise<FinancialSummary> {
  const txns = await fetchScopedTransactions(filters);
  const summary = summarizeByCategory(txns, { eventId: filters.eventId });

  if (filters.eventId) {
    return { ...summary, startDate: filters.startDate, endDate: filters.endDate, eventId: filters.eventId };
  }

  const [eventBreakdown, receivables, payables] = await Promise.all([
    getEventBreakdown(filters),
    getOutstanding('receivable'),
    getOutstanding('payable'),
  ]);

  return {
    ...summary,
    startDate: filters.startDate,
    endDate: filters.endDate,
    eventBreakdown,
    pendingReceivables: receivables,
    pendingPayables: payables,
  };
}

/** Convenience wrapper for the per-event dashboard/detail pane — defaults to all-time for that event. */
export async function getEventFinancialSummary(
  eventId: string,
  range: DateRangeFilter = {},
): Promise<FinancialSummary> {
  return getFinancialSummary({
    eventId,
    startDate: range.startDate ?? '1970-01-01',
    endDate: range.endDate ?? '2999-12-31',
  });
}

async function getOutstanding(kind: 'receivable' | 'payable'): Promise<number> {
  if (kind === 'receivable') {
    const items = await prisma.finAccountsReceivable.findMany({ where: { status: { in: ['pending', 'partial'] } } });
    return items.reduce((sum, item) => sum + (toNumber(item.amount) - toNumber(item.receivedAmount)), 0);
  }
  const items = await prisma.finAccountsPayable.findMany({ where: { status: { in: ['pending', 'partial'] } } });
  return items.reduce((sum, item) => sum + (toNumber(item.amount) - toNumber(item.paidAmount)), 0);
}

/** Shared fetch used by the Transactions page and Reports page list views — same where-builder as the summary functions above. */
export async function getTransactionsForFilter(filters: TxnScopeFilter): Promise<FinTxnWithRelations[]> {
  return fetchScopedTransactions(filters);
}

/** True when a category's bucket means "never contributes to any total" — see classifyLineItem. */
export function isDoNotConsiderCategory(categoryType: string | null | undefined): boolean {
  return categoryType === 'do_not_consider';
}

/**
 * Resolve a FinCategory by its stable `code` — never by display `name`,
 * which committee members can rename freely from the Categories admin page
 * (this was the root cause of several categories silently stopping being
 * matched). Falls back to `name` while historical rows haven't had `code`
 * backfilled yet (see scripts/seed-fin-accounts.ts).
 */
export async function resolveCategoryId(code: string, fallbackName?: string): Promise<string | null> {
  const byCode = await prisma.finCategory.findFirst({ where: { code } });
  if (byCode) return byCode.id;
  if (fallbackName) {
    const byName = await prisma.finCategory.findFirst({ where: { name: fallbackName } });
    if (byName) return byName.id;
  }
  return null;
}

export { effectiveSplitEventId, FIN_TXN_INCLUDE };
export type { FinTxnWithRelations };
