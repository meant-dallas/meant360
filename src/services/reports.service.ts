import {
  incomeRepository,
  sponsorRepository,
  expenseRepository,
  eventParticipantRepository,
  eventRepository,
} from '@/repositories';
import {
  generateEventReport,
  generateMonthlyReport,
  generateAnnualReport,
  type EventReportData,
  type MonthlyReportData,
  type AnnualReportData,
} from '@/lib/pdf';
import { format } from 'date-fns';

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

/** Sum paid participant income from EventParticipants, extracting date from registeredAt/checkedInAt. */
function sumParticipantIncome(
  participants: Record<string, string>[],
  filter: { eventIds?: Set<string>; startDate?: string; endDate?: string },
): number {
  let total = 0;
  for (const r of participants) {
    const price = parseFloat(r.totalPrice || '0');
    if (price <= 0 || r.paymentStatus !== 'paid') continue;
    if (filter.eventIds && !filter.eventIds.has(r.eventId)) continue;
    if (filter.startDate || filter.endDate) {
      const dateStr = (r.registeredAt || r.checkedInAt || '').split('T')[0];
      if (filter.startDate && dateStr < filter.startDate) continue;
      if (filter.endDate && dateStr > filter.endDate) continue;
    }
    total += price;
  }
  return total;
}

function buildSummaryCsv(
  participationIncome: number,
  sponsorshipIncome: number,
  totalExpenses: number,
): string[][] {
  const profitLoss = participationIncome + sponsorshipIncome - totalExpenses;
  return [
    ['Category', 'Amount'],
    ['Participation Income', String(participationIncome)],
    ['Sponsorship Income', String(sponsorshipIncome)],
    ['Total Expenses', String(totalExpenses)],
    ['Profit/Loss', String(profitLoss)],
  ];
}

// --- Event Report ---

export async function handleEventReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const eventName = params.get('event');
  if (!eventName) throw new Error('Event name is required');

  const [incomeRows, sponsorRows, expenseRows, participantRows, eventRows] = await Promise.all([
    incomeRepository.findAll(),
    sponsorRepository.findAll(),
    expenseRepository.findAll(),
    eventParticipantRepository.findAll(),
    eventRepository.findAll(),
  ]);

  const eventIds = new Set(eventRows.filter((e) => e.name === eventName).map((e) => e.id));
  const eventDate = eventRows.find((e) => e.name === eventName)?.date || '';

  // Participation Income = manual income for event + paid participant registrations
  const manualIncome = incomeRows
    .filter((r) => r.eventName === eventName)
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const participantIncome = sumParticipantIncome(participantRows, { eventIds });
  const participationIncome = manualIncome + participantIncome;

  // Sponsorship Income = paid sponsorships for event
  const sponsorshipIncome = sponsorRows
    .filter((r) => r.eventName === eventName && r.status === 'Paid')
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  // Expenses
  const totalExpenses = expenseRows
    .filter((r) => r.eventName === eventName)
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  if (fmt === 'csv') {
    return buildCsvResponse(buildSummaryCsv(participationIncome, sponsorshipIncome, totalExpenses), `event-report-${eventName}.csv`);
  }

  const data: EventReportData = { eventName, eventDate, participationIncome, sponsorshipIncome, totalExpenses };
  return buildPdfResponse(generateEventReport(data), `event-report-${eventName}.pdf`);
}

// --- Monthly Report ---

export async function handleMonthlyReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const year = parseInt(params.get('year') || String(new Date().getFullYear()));
  const month = parseInt(params.get('month') || String(new Date().getMonth() + 1));
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  const [incomeRows, sponsorRows, expenseRows, participantRows] = await Promise.all([
    incomeRepository.findAll(),
    sponsorRepository.findAll(),
    expenseRepository.findAll(),
    eventParticipantRepository.findAll(),
  ]);

  const manualIncome = incomeRows
    .filter((r) => r.date >= startDate && r.date <= endDate)
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const participantIncome = sumParticipantIncome(participantRows, { startDate, endDate });
  const participationIncome = manualIncome + participantIncome;

  const sponsorshipIncome = sponsorRows
    .filter((r) => r.paymentDate >= startDate && r.paymentDate <= endDate && r.status === 'Paid')
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  const totalExpenses = expenseRows
    .filter((r) => r.date >= startDate && r.date <= endDate)
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  if (fmt === 'csv') {
    return buildCsvResponse(buildSummaryCsv(participationIncome, sponsorshipIncome, totalExpenses), `monthly-report-${year}-${monthStr}.csv`);
  }

  const data: MonthlyReportData = {
    month: format(new Date(year, month - 1, 1), 'MMMM'),
    year,
    beginningBalance: parseFloat(params.get('beginningBalance') || '0'),
    participationIncome,
    sponsorshipIncome,
    totalExpenses,
  };

  return buildPdfResponse(generateMonthlyReport(data), `monthly-report-${year}-${monthStr}.pdf`);
}

// --- Annual Report ---

export async function handleAnnualReport(params: URLSearchParams, fmt: string): Promise<Response> {
  const year = parseInt(params.get('year') || String(new Date().getFullYear()));
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const [incomeRows, sponsorRows, expenseRows, participantRows, eventRows] = await Promise.all([
    incomeRepository.findAll(),
    sponsorRepository.findAll(),
    expenseRepository.findAll(),
    eventParticipantRepository.findAll(),
    eventRepository.findAll(),
  ]);

  const income = incomeRows;
  const sponsors = sponsorRows;
  const expenses = expenseRows;
  const participants = participantRows;
  const events = eventRows;

  const yearIncome = income.filter((r) => r.date >= startDate && r.date <= endDate);
  const yearSponsors = sponsors.filter(
    (r) => r.paymentDate >= startDate && r.paymentDate <= endDate && r.status === 'Paid',
  );
  const yearExpenses = expenses.filter((r) => r.date >= startDate && r.date <= endDate);

  // Build event ID → name lookup
  const eventNameMap = new Map<string, string>();
  for (const evt of events) eventNameMap.set(evt.id, evt.name);

  // Year totals
  const manualIncomeTotal = yearIncome.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const participantIncomeTotal = sumParticipantIncome(participants, { startDate, endDate });
  const participationIncome = manualIncomeTotal + participantIncomeTotal;
  const sponsorshipIncome = yearSponsors.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const totalExpenses = yearExpenses.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  if (fmt === 'csv') {
    const profitLoss = participationIncome + sponsorshipIncome - totalExpenses;
    const rows: string[][] = [
      ['Category', 'Amount'],
      ['Participation Income', String(participationIncome)],
      ['Sponsorship Income', String(sponsorshipIncome)],
      ['Total Expenses', String(totalExpenses)],
      ['Profit/Loss', String(profitLoss)],
      [],
      ['Month', 'Participation', 'Sponsorship', 'Expenses', 'Net'],
    ];

    for (let i = 0; i < 12; i++) {
      const m = String(i + 1).padStart(2, '0');
      const ms = `${year}-${m}-01`;
      const me = `${year}-${m}-31`;
      const mManual = yearIncome.filter((r) => r.date >= ms && r.date <= me)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mParticipant = sumParticipantIncome(participants, { startDate: ms, endDate: me });
      const mSponsorship = yearSponsors.filter((r) => r.paymentDate >= ms && r.paymentDate <= me)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mExpenses = yearExpenses.filter((r) => r.date >= ms && r.date <= me)
        .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
      const mParticipation = mManual + mParticipant;
      rows.push([
        format(new Date(year, i, 1), 'MMM'),
        String(mParticipation),
        String(mSponsorship),
        String(mExpenses),
        String(mParticipation + mSponsorship - mExpenses),
      ]);
    }

    return buildCsvResponse(rows, `annual-report-${year}.csv`);
  }

  // Monthly summary
  const monthlySummary = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const ms = `${year}-${m}-01`;
    const me = `${year}-${m}-31`;
    const mManual = yearIncome.filter((r) => r.date >= ms && r.date <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const mParticipant = sumParticipantIncome(participants, { startDate: ms, endDate: me });
    const mParticipation = mManual + mParticipant;
    const mSponsorship = yearSponsors.filter((r) => r.paymentDate >= ms && r.paymentDate <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const mExpenses = yearExpenses.filter((r) => r.date >= ms && r.date <= me)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    return {
      month: format(new Date(year, i, 1), 'MMM'),
      participation: mParticipation,
      sponsorship: mSponsorship,
      expenses: mExpenses,
      net: mParticipation + mSponsorship - mExpenses,
    };
  });

  // Event summaries
  const eventNames = new Set<string>();
  yearIncome.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
  yearSponsors.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
  yearExpenses.forEach((r) => { if (r.eventName) eventNames.add(r.eventName); });
  // Add events that have participant income
  for (const p of participants) {
    if (parseFloat(p.totalPrice || '0') > 0 && p.paymentStatus === 'paid') {
      const name = eventNameMap.get(p.eventId);
      if (name) eventNames.add(name);
    }
  }

  const eventSummaries = Array.from(eventNames).map((evtName) => {
    const evtIds = new Set(events.filter((e) => e.name === evtName).map((e) => e.id));
    const evtManual = yearIncome.filter((r) => r.eventName === evtName)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const evtParticipant = sumParticipantIncome(participants, { eventIds: evtIds });
    const evtParticipation = evtManual + evtParticipant;
    const evtSponsorship = yearSponsors.filter((r) => r.eventName === evtName)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    const evtExpenses = yearExpenses.filter((r) => r.eventName === evtName)
      .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
    return {
      eventName: evtName,
      participation: evtParticipation,
      sponsorship: evtSponsorship,
      expenses: evtExpenses,
      net: evtParticipation + evtSponsorship - evtExpenses,
    };
  });

  const data: AnnualReportData = {
    year,
    participationIncome,
    sponsorshipIncome,
    totalExpenses,
    monthlySummary,
    eventSummaries,
  };

  return buildPdfResponse(generateAnnualReport(data), `annual-report-${year}.pdf`);
}
