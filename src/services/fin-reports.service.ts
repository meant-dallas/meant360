import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finReportsService = {
  async monthlyIncome(startDate: string, endDate: string, eventId?: string) {
    const txns = await getTransactions(startDate, endDate, 'income', eventId);
    return groupByMonthAndCategory(txns, eventId);
  },

  async monthlyExpenses(startDate: string, endDate: string, eventId?: string) {
    const txns = await getTransactions(startDate, endDate, 'expense', eventId);
    return groupByMonthAndCategory(txns, eventId);
  },

  async annualSummary(startDate: string, endDate: string, eventId?: string) {
    const txns = await getTransactions(startDate, endDate, undefined, eventId);

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalFees = 0;
    const incomeByCategory: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};

    for (const t of txns) {
      const fee = Number(t.fee);

      // Check if transaction has splits
      if (t.splits && t.splits.length > 0) {
        // When filtering by event, only count splits matching that event
        const relevantSplits = eventId
          ? t.splits.filter((s) => s.eventId === eventId)
          : t.splits;

        // Only count fees for non-split txns or proportionally — for simplicity, skip fees on split txns
        for (const split of relevantSplits) {
          if (split.categoryId && split.category) {
            const splitAmount = Math.abs(Number(split.amount));
            const catName = split.category.name;

            if (t.type === 'income') {
              totalIncome += splitAmount;
              incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + splitAmount;
            } else {
              totalExpenses += splitAmount;
              expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + splitAmount;
            }
          }
          // Splits without categoryId (like transfers to accounts) are not counted as income/expense
        }
      } else {
        // No splits - use full transaction amount
        totalFees += fee;
        const amount = Math.abs(Number(t.grossAmount));
        const catName = t.category?.name ?? 'Uncategorized';

        if (t.type === 'income') {
          totalIncome += amount;
          incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + amount;
        } else {
          totalExpenses += amount;
          expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + amount;
        }
      }
    }

    // Event-wise summary
    const eventSummary = eventId ? [] : await getEventSummary(startDate, endDate);

    // Pending summary (only when no event filter)
    const [receivables, payables] = eventId ? [{ total: 0 }, { total: 0 }] : await Promise.all([
      finReportsService.receivablesSummary(),
      finReportsService.payablesSummary(),
    ]);

    return {
      startDate,
      endDate,
      totalIncome,
      totalExpenses,
      totalFees,
      netIncome: totalIncome - totalExpenses,
      incomeByCategory,
      expenseByCategory,
      eventSummary,
      pendingReceivables: receivables.total,
      pendingPayables: payables.total,
    };
  },

  async eventSummary(startDate: string, endDate: string) {
    return getEventSummary(startDate, endDate);
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

  async overview(startDate: string, endDate: string) {
    const txns = await getTransactions(startDate, endDate);

    let totalIncome = 0;
    let totalExpenses = 0;
    const incomeByCategory: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};

    for (const t of txns) {
      // Check if transaction has splits
      if (t.splits && t.splits.length > 0) {
        // Use split amounts only for splits with categoryId
        for (const split of t.splits) {
          if (split.categoryId && split.category) {
            const splitAmount = Math.abs(Number(split.amount));
            const catName = split.category.name;

            if (t.type === 'income') {
              totalIncome += splitAmount;
              incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + splitAmount;
            } else {
              totalExpenses += splitAmount;
              expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + splitAmount;
            }
          }
        }
      } else {
        // No splits - use full transaction amount
        const amount = Math.abs(Number(t.grossAmount));
        const catName = t.category?.name ?? 'Uncategorized';

        if (t.type === 'income') {
          totalIncome += amount;
          incomeByCategory[catName] = (incomeByCategory[catName] ?? 0) + amount;
        } else {
          totalExpenses += amount;
          expenseByCategory[catName] = (expenseByCategory[catName] ?? 0) + amount;
        }
      }
    }

    // Count uncategorized: transactions with no category AND no splits
    const [txnStats, arStats, apStats] = await Promise.all([
      prisma.finRawTransaction.count({ where: { categoryId: null, splits: { none: {} } } }),
      prisma.finAccountsReceivable.findMany({ where: { status: { in: ['pending', 'partial'] } } }),
      prisma.finAccountsPayable.findMany({ where: { status: { in: ['pending', 'partial'] } } }),
    ]);

    let arOutstanding = 0;
    for (const ar of arStats) arOutstanding += Number(ar.amount) - Number(ar.receivedAmount);
    let apOutstanding = 0;
    for (const ap of apStats) apOutstanding += Number(ap.amount) - Number(ap.paidAmount);

    return {
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      incomeByCategory,
      expenseByCategory,
      uncategorized: txnStats,
      arOutstanding,
      apOutstanding,
    };
  },
};

async function getTransactions(startDate: string, endDate: string, type?: string, eventId?: string) {
  const where: Prisma.FinRawTransactionWhereInput = {
    excluded: false,
    status: 'Completed',
    transactionDate: {
      gte: new Date(startDate),
      lte: new Date(endDate + 'T23:59:59Z'),
    },
  };
  if (type) where.type = type;

  // When filtering by event, also include split transactions that have splits linked to this event
  if (eventId) {
    where.OR = [
      { eventId, splits: { none: {} } },
      { splits: { some: { eventId } } },
    ];
  }

  return prisma.finRawTransaction.findMany({
    where,
    include: {
      category: true,
      event: true,
      splits: {
        include: { category: true }
      }
    },
    orderBy: { transactionDate: 'asc' },
  });
}

async function getEventSummary(startDate: string, endDate: string) {
  // Fetch transactions that have an event on the parent OR on any split
  const txns = await prisma.finRawTransaction.findMany({
    where: {
      excluded: false,
      status: 'Completed',
      transactionDate: {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59Z'),
      },
      OR: [
        { eventId: { not: null }, splits: { none: {} } },
        { splits: { some: { eventId: { not: null } } } },
      ],
    },
    include: {
      event: true,
      splits: {
        include: { category: true }
      }
    },
  });

  // Also fetch all events referenced by splits for name lookup
  const allEvents = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameMap = new Map(allEvents.map((e) => [e.id, e.name]));

  const eventMap: Record<string, { eventName: string; income: number; expense: number }> = {};

  const addToEvent = (evId: string, type: string, amount: number) => {
    if (!eventMap[evId]) {
      eventMap[evId] = { eventName: eventNameMap.get(evId) ?? 'Unknown Event', income: 0, expense: 0 };
    }
    if (type === 'income') eventMap[evId].income += amount;
    else eventMap[evId].expense += amount;
  };

  for (const t of txns) {
    if (t.splits && t.splits.length > 0) {
      // Attribute each split to its own eventId
      for (const split of t.splits) {
        if (split.categoryId && split.eventId) {
          addToEvent(split.eventId, t.type, Math.abs(Number(split.amount)));
        }
      }
    } else if (t.eventId) {
      addToEvent(t.eventId, t.type, Math.abs(Number(t.grossAmount)));
    }
  }

  return Object.values(eventMap).map((e) => ({
    ...e,
    profitLoss: e.income - e.expense,
  }));
}

function groupByMonthAndCategory(
  txns: Array<{
    transactionDate: Date;
    grossAmount: Prisma.Decimal;
    category: { name: string } | null;
    splits?: Array<{ categoryId: string | null; eventId: string | null; amount: Prisma.Decimal; category: { name: string } | null }>;
  }>,
  eventId?: string,
) {
  const months: Record<string, Record<string, number>> = {};
  const categories = new Set<string>();

  for (const t of txns) {
    const monthKey = `${t.transactionDate.getFullYear()}-${String(t.transactionDate.getMonth() + 1).padStart(2, '0')}`;

    if (!months[monthKey]) months[monthKey] = {};

    // Check if transaction has splits
    if (t.splits && t.splits.length > 0) {
      const relevantSplits = eventId
        ? t.splits.filter((s) => s.eventId === eventId)
        : t.splits;
      for (const split of relevantSplits) {
        if (split.categoryId && split.category) {
          const catName = split.category.name;
          categories.add(catName);
          months[monthKey][catName] = (months[monthKey][catName] ?? 0) + Math.abs(Number(split.amount));
        }
      }
    } else {
      // No splits - use full transaction amount
      const catName = t.category?.name ?? 'Uncategorized';
      categories.add(catName);
      months[monthKey][catName] = (months[monthKey][catName] ?? 0) + Math.abs(Number(t.grossAmount));
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
