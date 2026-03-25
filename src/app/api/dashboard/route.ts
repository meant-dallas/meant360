import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { type DashboardSummary, type EventSummary, type MonthlySummary } from '@/types';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [incomeRows, sponsorshipRows, expenseRows, reimbursedInYearRows] = await Promise.all([
      prisma.income.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
      prisma.sponsor.findMany({ where: { paymentDate: { gte: startDate, lte: endDate } } }),
      prisma.expense.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
      prisma.expense.findMany({ where: {
        needsReimbursement: 'true',
        reimbStatus: 'Reimbursed',
        reimbursedDate: { gte: startDate, lte: endDate },
      } }),
    ]);

    const toStr = (v: unknown) => v == null ? '' : String(v);
    const toRecord = (row: Record<string, unknown>): Record<string, string> =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toStr(v)]));

    const income = incomeRows.map(r => toRecord(r as unknown as Record<string, unknown>));
    const sponsorship = sponsorshipRows.map(r => toRecord(r as unknown as Record<string, unknown>));
    const expenses = expenseRows.map(r => toRecord(r as unknown as Record<string, unknown>));

    // Derive reimbursement data from expenses flagged needsReimbursement
    const reimbExpenses = expenses.filter((r) => r.needsReimbursement?.toLowerCase() === 'true');
    const reimbursedPaid = reimbursedInYearRows.map(r => toRecord(r as unknown as Record<string, unknown>));

    // Totals
    const totalIncome = income.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const totalSponsorship = sponsorship
      .filter((r) => r.status === 'Paid')
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const outstandingReimbursements = reimbExpenses
      .filter((r) => r.reimbStatus === 'Pending' || r.reimbStatus === 'Approved')
      .reduce((s, r) => s + parseFloat(r.reimbAmount || r.amount || '0'), 0);
    const totalReimbursed = reimbursedPaid
      .reduce((s, r) => s + parseFloat(r.reimbAmount || r.amount || '0'), 0);

    // Event summaries
    const eventNames = new Set<string>();
    income.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
    sponsorship.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
    expenses.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });

    const eventSummaries: EventSummary[] = Array.from(eventNames).map((eventName) => {
      const evtIncome = income
        .filter((r) => r.eventName === eventName)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const evtSponsorship = sponsorship
        .filter((r) => r.eventName === eventName && r.status === 'Paid')
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const evtExpenses = expenses
        .filter((r) => r.eventName === eventName)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const evtReimbursements = reimbursedPaid
        .filter((r) => r.eventName === eventName)
        .reduce((s, r) => s + parseFloat(r.reimbAmount || r.amount || '0'), 0);
      return {
        eventName,
        income: evtIncome,
        sponsorship: evtSponsorship,
        expenses: evtExpenses,
        reimbursements: evtReimbursements,
        net: evtIncome + evtSponsorship - evtExpenses,
      };
    });

    // Monthly summary
    const months = Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, '0');
      const monthStart = `${year}-${monthNum}-01`;
      const monthEnd = `${year}-${monthNum}-31`;

      const mIncome = income
        .filter((r) => r.date >= monthStart && r.date <= monthEnd)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mSponsorship = sponsorship
        .filter((r) => r.paymentDate >= monthStart && r.paymentDate <= monthEnd && r.status === 'Paid')
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mExpenses = expenses
        .filter((r) => r.date >= monthStart && r.date <= monthEnd)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mReimbursements = reimbursedPaid
        .filter((r) => r.reimbursedDate >= monthStart && r.reimbursedDate <= monthEnd)
        .reduce((s, r) => s + parseFloat(r.reimbAmount || r.amount || '0'), 0);

      return {
        month: format(new Date(year, i, 1), 'MMM'),
        income: mIncome,
        sponsorship: mSponsorship,
        expenses: mExpenses,
        reimbursements: mReimbursements,
        net: mIncome + mSponsorship - mExpenses,
      } as MonthlySummary;
    });

    const summary: DashboardSummary = {
      totalIncome,
      totalSponsorship,
      totalExpenses,
      netSurplus: totalIncome + totalSponsorship - totalExpenses,
      outstandingReimbursements,
      totalReimbursed,
      eventSummaries,
      monthlySummary: months,
    };

    return jsonResponse(summary);
  } catch (error) {
    console.error('GET /api/dashboard error:', error);
    Sentry.captureException(error, { extra: { context: 'Dashboard GET' } });
    return errorResponse('Failed to load dashboard data', 500, error);
  }
}
