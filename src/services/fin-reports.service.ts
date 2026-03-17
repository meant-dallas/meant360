import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finReportsService = {
  async monthlyIncome(startDate: string, endDate: string) {
    const entries = await prisma.finLedgerEntry.findMany({
      where: {
        type: 'income',
        transactionDate: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
      include: { category: true },
      orderBy: { transactionDate: 'asc' },
    });

    return groupByMonthAndCategory(entries);
  },

  async monthlyExpenses(startDate: string, endDate: string) {
    const entries = await prisma.finLedgerEntry.findMany({
      where: {
        type: { in: ['expense', 'fee'] },
        transactionDate: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
      include: { category: true },
      orderBy: { transactionDate: 'asc' },
    });

    return groupByMonthAndCategory(entries);
  },

  async eventIncome(eventId: string) {
    const entries = await prisma.finLedgerEntry.findMany({
      where: {
        type: 'income',
        sourceTransaction: { eventId },
      },
      include: { category: true },
    });

    let total = 0;
    const byCategory: Record<string, number> = {};
    for (const e of entries) {
      const amount = Number(e.amount);
      total += amount;
      const catName = e.category?.name ?? 'Uncategorized';
      byCategory[catName] = (byCategory[catName] ?? 0) + amount;
    }

    return { total, byCategory, entries };
  },

  async annualSummary(year: number) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    const entries = await prisma.finLedgerEntry.findMany({
      where: {
        transactionDate: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalFees = 0;
    const incomeByCategory: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};

    for (const e of entries) {
      const amount = Number(e.amount);
      const catName = e.category?.name ?? 'Uncategorized';

      if (e.type === 'income') {
        totalIncome += amount;
        incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + amount;
      } else if (e.type === 'expense') {
        totalExpenses += amount;
        expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + amount;
      } else if (e.type === 'fee') {
        totalFees += amount;
        expenseByCategory['Processing Fees'] = (expenseByCategory['Processing Fees'] ?? 0) + amount;
      }
    }

    return {
      year,
      totalIncome,
      totalExpenses: totalExpenses + totalFees,
      totalFees,
      netIncome: totalIncome - totalExpenses - totalFees,
      incomeByCategory,
      expenseByCategory,
    };
  },

  async processingFees(startDate: string, endDate: string) {
    const entries = await prisma.finLedgerEntry.findMany({
      where: {
        type: 'fee',
        transactionDate: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
      include: { sourceTransaction: true },
      orderBy: { transactionDate: 'asc' },
    });

    let total = 0;
    const byProvider: Record<string, number> = {};
    for (const e of entries) {
      const amount = Number(e.amount);
      total += amount;
      const provider = e.sourceTransaction?.provider ?? 'unknown';
      byProvider[provider] = (byProvider[provider] ?? 0) + amount;
    }

    return { total, byProvider, entries };
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
      const remaining = Number(item.amount) - Number(item.receivedAmount);
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
      const remaining = Number(item.amount) - Number(item.paidAmount);
      total += remaining;
      if (item.dueDate && item.dueDate < now) overdue += remaining;
    }

    return { total, overdue, items };
  },

  async accountBalances() {
    // Delegate to the ledger service's account balances
    const { finLedgerService } = await import('./fin-ledger.service');
    return finLedgerService.getAccountBalances();
  },

  async overview() {
    const year = new Date().getFullYear();
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    const entries = await prisma.finLedgerEntry.findMany({
      where: { transactionDate: { gte: startDate, lte: endDate } },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    for (const e of entries) {
      const amount = Number(e.amount);
      if (e.type === 'income') totalIncome += amount;
      else totalExpenses += amount;
    }

    const [txnStats, arStats, apStats, unmatchedCount] = await Promise.all([
      prisma.finRawTransaction.count({ where: { status: 'NEW' } }),
      prisma.finAccountsReceivable.findMany({ where: { status: { in: ['pending', 'partial'] } } }),
      prisma.finAccountsPayable.findMany({ where: { status: { in: ['pending', 'partial'] } } }),
      prisma.finRawTransaction.count({ where: { reconciled: false, provider: 'bank' } }),
    ]);

    let arOutstanding = 0;
    for (const ar of arStats) arOutstanding += Number(ar.amount) - Number(ar.receivedAmount);
    let apOutstanding = 0;
    for (const ap of apStats) apOutstanding += Number(ap.amount) - Number(ap.paidAmount);

    return {
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      needsReview: txnStats,
      unmatchedBankDeposits: unmatchedCount,
      arOutstanding,
      apOutstanding,
    };
  },
};

function groupByMonthAndCategory(
  entries: Array<{ transactionDate: Date; amount: Prisma.Decimal; category: { name: string } | null }>,
) {
  const months: Record<string, Record<string, number>> = {};
  const categories = new Set<string>();

  for (const e of entries) {
    const monthKey = `${e.transactionDate.getFullYear()}-${String(e.transactionDate.getMonth() + 1).padStart(2, '0')}`;
    const catName = e.category?.name ?? 'Uncategorized';
    categories.add(catName);

    if (!months[monthKey]) months[monthKey] = {};
    months[monthKey][catName] = (months[monthKey][catName] ?? 0) + Number(e.amount);
  }

  // Compute totals
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
