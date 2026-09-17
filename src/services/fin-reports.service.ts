import { prisma } from '@/lib/db';
import { toNumber } from '@/lib/utils';
import {
  getFinancialSummary,
  getEventBreakdown,
  getTransactionsForFilter,
  isMemberReimbursementCategory,
  type FinTxnWithRelations,
} from '@/services/fin-summary.service';

export const finReportsService = {
  async monthlyIncome(startDate: string, endDate: string, eventId?: string) {
    // Include both income and refund types (refunds are negative income)
    const [incomeTxns, refundTxns] = await Promise.all([
      getTransactionsForFilter({ startDate, endDate, eventId, type: 'income' }),
      getTransactionsForFilter({ startDate, endDate, eventId, type: 'refund' }),
    ]);
    return groupByMonthAndCategory([...incomeTxns, ...refundTxns], eventId);
  },

  async monthlyExpenses(startDate: string, endDate: string, eventId?: string) {
    const txns = await getTransactionsForFilter({ startDate, endDate, eventId, type: 'expense' });
    return groupByMonthAndCategory(txns, eventId);
  },

  async annualSummary(startDate: string, endDate: string, eventId?: string) {
    const summary = await getFinancialSummary({ startDate, endDate, eventId });
    return {
      startDate,
      endDate,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      totalFees: summary.totalFees,
      netIncome: summary.netIncome,
      incomeByCategory: summary.incomeByCategory,
      expenseByCategory: summary.expenseByCategory,
      eventSummary: summary.eventBreakdown ?? [],
      pendingReceivables: summary.pendingReceivables ?? 0,
      pendingPayables: summary.pendingPayables ?? 0,
    };
  },

  async eventSummary(startDate: string, endDate: string) {
    return getEventBreakdown({ startDate, endDate });
  },

  async receivablesSummary() {
    const items = await prisma.finAccountsReceivable.findMany({
      where: { status: { in: ['pending', 'partial'] } },
      orderBy: { dueDate: 'asc' },
    });

    let total = 0;
    const now = new Date();
    let overdue = 0;
    for (const item of items) {
      const remaining = toNumber(item.amount) - toNumber(item.receivedAmount);
      total += remaining;
      if (item.dueDate && item.dueDate < now) overdue += remaining;
    }

    return { total, overdue, items };
  },

  async payablesSummary() {
    const items = await prisma.finAccountsPayable.findMany({
      where: { status: { in: ['pending', 'partial'] } },
      orderBy: { dueDate: 'asc' },
    });

    let total = 0;
    const now = new Date();
    let overdue = 0;
    for (const item of items) {
      const remaining = toNumber(item.amount) - toNumber(item.paidAmount);
      total += remaining;
      if (item.dueDate && item.dueDate < now) overdue += remaining;
    }

    return { total, overdue, items };
  },

  async overview(startDate: string, endDate: string) {
    const summary = await getFinancialSummary({ startDate, endDate });
    return {
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      totalFees: summary.totalFees,
      netBalance: summary.netIncome,
      incomeByCategory: summary.incomeByCategory,
      expenseByCategory: summary.expenseByCategory,
      uncategorized: summary.uncategorizedCount,
      arOutstanding: summary.pendingReceivables ?? 0,
      apOutstanding: summary.pendingPayables ?? 0,
    };
  },
};

function groupByMonthAndCategory(txns: FinTxnWithRelations[], eventId?: string) {
  const months: Record<string, Record<string, number>> = {};
  const categories = new Set<string>();

  for (const t of txns) {
    const monthKey = `${t.transactionDate.getFullYear()}-${String(t.transactionDate.getMonth() + 1).padStart(2, '0')}`;
    const sign = t.type === 'refund' ? -1 : 1;

    if (!months[monthKey]) months[monthKey] = {};

    if (t.splits.length > 0) {
      const relevantSplits = eventId
        ? t.splits.filter((s) => (s.eventId ?? t.eventId) === eventId)
        : t.splits;
      for (const split of relevantSplits) {
        if (isMemberReimbursementCategory(split.category?.name)) continue;
        const catName = split.category?.name ?? 'Uncategorized';
        categories.add(catName);
        months[monthKey][catName] = (months[monthKey][catName] ?? 0) + sign * Math.abs(toNumber(split.amount));
      }
    } else if (!isMemberReimbursementCategory(t.category?.name)) {
      const catName = t.category?.name ?? 'Uncategorized';
      categories.add(catName);
      months[monthKey][catName] = (months[monthKey][catName] ?? 0) + sign * Math.abs(toNumber(t.netAmount));
    }
  }

  const monthTotals: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const [month, cats] of Object.entries(months)) {
    let monthSum = 0;
    for (const [cat, amount] of Object.entries(cats)) {
      monthSum += amount;
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amount;
    }
    monthTotals[month] = monthSum;
    grandTotal += monthSum;
  }

  return {
    months,
    categories: Array.from(categories).sort(),
    monthTotals,
    categoryTotals,
    grandTotal,
  };
}
