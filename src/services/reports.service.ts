import { getRows } from '@/lib/google-sheets';
import { SHEET_TABS } from '@/types';
import {
  generateEventReport,
  generateMonthlyReport,
  generateAnnualReport,
  type EventReportData,
  type MonthlyReportData,
  type AnnualReportData,
} from '@/lib/pdf';
import { format } from 'date-fns';
import { groupBy, sumBy } from '@/lib/utils';

// ========================================
// Report Services
// ========================================

function buildCsvResponse(rows: string[][], filename: string): Response {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function buildPdfResponse(pdfBytes: ArrayBuffer, filename: string): Response {
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export async function handleEventReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const eventName = params.get('event');
  if (!eventName) throw new Error('Event name is required');

  const [incomeRows, sponsorshipRows, expenseRows] = await Promise.all([
    getRows(SHEET_TABS.INCOME),
    getRows(SHEET_TABS.SPONSORSHIP),
    getRows(SHEET_TABS.EXPENSES),
  ]);

  const eventIncome = incomeRows.filter((r) => r.eventName === eventName);
  const eventSponsorship = sponsorshipRows.filter((r) => r.eventName === eventName);
  const eventExpenses = expenseRows.filter((r) => r.eventName === eventName);

  if (fmt === 'csv') {
    return buildCsvResponse(
      [
        ['Section', 'Type/Category', 'Details', 'Amount'],
        ...eventIncome.map((r) => ['Income', r.incomeType, r.payerName, r.amount]),
        ...eventSponsorship.map((r) => ['Sponsorship', r.sponsorName, r.status, r.amount]),
        ...eventExpenses.map((r) => ['Expense', r.category, r.description, r.amount]),
      ],
      `event-report-${eventName}.csv`,
    );
  }

  const data: EventReportData = {
    eventName,
    eventDate: '',
    income: eventIncome.map((r) => ({
      type: r.incomeType, amount: parseFloat(r.amount || '0'), details: r.payerName || r.notes,
    })),
    sponsorship: eventSponsorship.map((r) => ({
      sponsor: r.sponsorName, amount: parseFloat(r.amount || '0'), status: r.status,
    })),
    expenses: eventExpenses.map((r) => ({
      category: r.category, description: r.description,
      amount: parseFloat(r.amount || '0'), paidBy: r.paidBy,
    })),
  };

  return buildPdfResponse(generateEventReport(data), `event-report-${eventName}.pdf`);
}

export async function handleMonthlyReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const year = parseInt(params.get('year') || String(new Date().getFullYear()));
  const month = parseInt(params.get('month') || String(new Date().getMonth() + 1));
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  const [incomeRows, expenseRows] = await Promise.all([
    getRows(SHEET_TABS.INCOME),
    getRows(SHEET_TABS.EXPENSES),
  ]);

  const monthIncome = incomeRows.filter((r) => r.date >= startDate && r.date <= endDate);
  const monthExpenses = expenseRows.filter((r) => r.date >= startDate && r.date <= endDate);

  const incomeByType = groupBy(monthIncome, 'incomeType' as keyof typeof monthIncome[0]);
  const expenseByCategory = groupBy(monthExpenses, 'category' as keyof typeof monthExpenses[0]);

  if (fmt === 'csv') {
    const rows: string[][] = [['Category', 'Type', 'Amount']];
    Object.entries(incomeByType).forEach(([type, items]) => {
      rows.push(['Income', type, String(sumBy(items, 'amount' as keyof typeof items[0]))]);
    });
    Object.entries(expenseByCategory).forEach(([cat, items]) => {
      rows.push(['Expense', cat, String(sumBy(items, 'amount' as keyof typeof items[0]))]);
    });
    return buildCsvResponse(rows, `monthly-report-${year}-${monthStr}.csv`);
  }

  const data: MonthlyReportData = {
    month: format(new Date(year, month - 1, 1), 'MMMM'),
    year,
    beginningBalance: parseFloat(params.get('beginningBalance') || '0'),
    incomeByCategory: Object.entries(incomeByType).map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0),
    })),
    expenseByCategory: Object.entries(expenseByCategory).map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0),
    })),
  };

  return buildPdfResponse(generateMonthlyReport(data), `monthly-report-${year}-${monthStr}.pdf`);
}

export async function handleAnnualReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const year = parseInt(params.get('year') || String(new Date().getFullYear()));
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const [incomeRows, sponsorshipRows, expenseRows] = await Promise.all([
    getRows(SHEET_TABS.INCOME),
    getRows(SHEET_TABS.SPONSORSHIP),
    getRows(SHEET_TABS.EXPENSES),
  ]);

  const yearIncome = incomeRows.filter((r) => r.date >= startDate && r.date <= endDate);
  const yearSponsorship = sponsorshipRows.filter(
    (r) => r.paymentDate >= startDate && r.paymentDate <= endDate && r.status === 'Paid',
  );
  const yearExpenses = expenseRows.filter((r) => r.date >= startDate && r.date <= endDate);

  const incomeByType = groupBy(yearIncome, 'incomeType' as keyof typeof yearIncome[0]);
  const expenseByCategory = groupBy(yearExpenses, 'category' as keyof typeof yearExpenses[0]);

  if (fmt === 'csv') {
    const rows: string[][] = [['Category', 'Type', 'Amount']];
    Object.entries(incomeByType).forEach(([type, items]) => {
      rows.push(['Income', type, String(items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0))]);
    });
    rows.push(['Sponsorship', 'Total', String(yearSponsorship.reduce((s, r) => s + parseFloat(r.amount || '0'), 0))]);
    Object.entries(expenseByCategory).forEach(([cat, items]) => {
      rows.push(['Expense', cat, String(items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0))]);
    });
    return buildCsvResponse(rows, `annual-report-${year}.csv`);
  }

  const monthlySummary = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const ms = `${year}-${m}-01`;
    const me = `${year}-${m}-31`;
    const mIncome = yearIncome.filter((r) => r.date >= ms && r.date <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const mSponsorship = yearSponsorship.filter((r) => r.paymentDate >= ms && r.paymentDate <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const mExpenses = yearExpenses.filter((r) => r.date >= ms && r.date <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    return {
      month: format(new Date(year, i, 1), 'MMM'),
      income: mIncome,
      sponsorship: mSponsorship,
      expenses: mExpenses,
      net: mIncome + mSponsorship - mExpenses,
    };
  });

  const eventNames = new Set<string>();
  yearIncome.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
  yearSponsorship.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
  yearExpenses.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });

  const eventSummaries = Array.from(eventNames).map((eventName) => ({
    eventName,
    income: yearIncome.filter((r) => r.eventName === eventName).reduce((s, r) => s + parseFloat(r.amount || '0'), 0),
    sponsorship: yearSponsorship.filter((r) => r.eventName === eventName).reduce((s, r) => s + parseFloat(r.amount || '0'), 0),
    expenses: yearExpenses.filter((r) => r.eventName === eventName).reduce((s, r) => s + parseFloat(r.amount || '0'), 0),
    net: 0,
  }));
  eventSummaries.forEach((e) => { e.net = e.income + e.sponsorship - e.expenses; });

  const data: AnnualReportData = {
    year,
    incomeByCategory: Object.entries(incomeByType).map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0),
    })),
    sponsorshipTotal: yearSponsorship.reduce((s, r) => s + parseFloat(r.amount || '0'), 0),
    expenseByCategory: Object.entries(expenseByCategory).map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0),
    })),
    monthlySummary,
    eventSummaries,
  };

  return buildPdfResponse(generateAnnualReport(data), `annual-report-${year}.pdf`);
}
