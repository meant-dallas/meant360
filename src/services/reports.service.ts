import { prisma } from '@/lib/db';
import { getEventFinancialSummary, isMemberReimbursementCategory } from '@/services/fin-summary.service';

// ========================================
// Report Services
// ========================================
//
// The Event/Monthly/Annual PDF/CSV report generators that used to live here
// (reading only legacy Income/Sponsor/EventParticipant tables, never the
// ledger) were retired along with the duplicate /reports page — the same
// reporting is now done on /accounting/reports, built on the shared,
// ledger-aware fin-summary.service.ts. What's left here are the "combined"
// bridge totals other services (events.service.ts's getStats) still need
// while historical rows haven't been backfilled into the ledger.

/**
 * IDs of legacy rows (from the given table) that scripts/migrate-legacy-finance-to-fin-model.ts
 * has already copied into the ledger. The "combined" functions below need
 * this to exclude those rows from the legacy side of the blend — once a row
 * is migrated it exists in FinRawTransaction too, and counting both would
 * double the amount.
 */
async function getMigratedLegacyIds(table: 'income' | 'expense' | 'sponsor'): Promise<Set<string>> {
  const rows = await prisma.finRawTransaction.findMany({
    where: { metadata: { path: ['legacySourceTable'], equals: table } },
    select: { metadata: true },
  });
  const ids = new Set<string>();
  for (const row of rows) {
    const id = (row.metadata as { legacySourceId?: string } | null)?.legacySourceId;
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Combined expense rows from both places an expense can be recorded: the
 * legacy Expense table (manual entries via Finance > Expenses) and
 * FinRawTransaction rows of type 'expense' (the newer Accounting module —
 * synced Square/PayPal expenses plus manual entries made there). Rows
 * explicitly marked `excluded` in the accounting module are skipped,
 * matching that flag's purpose. Legacy rows are matched by eventId when
 * available, falling back to the eventName string for older data that
 * predates the eventId column being populated. Returns a flat
 * {date, amount, eventName} list so callers can filter/bucket by month or
 * by event exactly like the original single-source Expense rows —
 * FinRawTransaction rows only carry eventId, so eventName is resolved here
 * against the Event table.
 */
async function getCombinedExpenseRows(filter: {
  eventId?: string;
  eventName?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ date: string; amount: number; eventName: string }[]> {
  const [legacyRows, finRows, eventRows, migratedIds] = await Promise.all([
    prisma.expense.findMany(),
    prisma.finRawTransaction.findMany({ where: { type: 'expense', excluded: false }, include: { category: true } }),
    prisma.event.findMany({ select: { id: true, name: true } }),
    getMigratedLegacyIds('expense'),
  ]);
  const eventNameById = new Map(eventRows.map((e) => [e.id, e.name]));

  let legacy = legacyRows.filter((e) => !migratedIds.has(e.id));
  if (filter.eventId || filter.eventName) {
    legacy = legacy.filter((e) => (filter.eventId && e.eventId === filter.eventId) || (filter.eventName && e.eventName === filter.eventName));
  }
  if (filter.startDate) legacy = legacy.filter((e) => e.date >= filter.startDate!);
  if (filter.endDate) legacy = legacy.filter((e) => e.date <= filter.endDate!);

  // Reimbursement payouts double-book the expense already recorded when the
  // member's underlying purchase happened — see fin-summary.service.ts.
  let fin = finRows.filter((r) => !isMemberReimbursementCategory(r.category?.name));
  if (filter.eventId) fin = fin.filter((r) => r.eventId === filter.eventId);
  const finRowsNormalized = fin.map((r) => ({
    date: r.transactionDate.toISOString().split('T')[0],
    // Math.abs: some rows (e.g. Zelle imports, which infer type from sign)
    // store an expense's grossAmount negative — fin-summary.service.ts
    // already normalizes this the same way; this bridge needs to match.
    amount: Math.abs(Number(r.grossAmount)),
    eventName: (r.eventId && eventNameById.get(r.eventId)) || '',
  }));
  const finFiltered = finRowsNormalized.filter((r) => {
    if (filter.startDate && r.date < filter.startDate) return false;
    if (filter.endDate && r.date > filter.endDate) return false;
    return true;
  });

  return [
    ...legacy.map((e) => ({ date: e.date, amount: e.amount, eventName: e.eventName })),
    ...finFiltered,
  ];
}

export async function getCombinedExpenseTotal(filter: Parameters<typeof getCombinedExpenseRows>[0]): Promise<number> {
  const rows = await getCombinedExpenseRows(filter);
  return rows.reduce((s, r) => s + r.amount, 0);
}

/**
 * Combined income total for one event, bridging the same transition the
 * expense side above bridges: the ledger (FinRawTransaction, via
 * fin-summary.service) is the complete, authoritative source for
 * registration/sponsorship/manual income recorded from here on — including
 * historical card payments, which always flowed through the ledger via
 * payments.service.ts's logFinTransaction — plus whatever legacy `Income`
 * (manual entries, not participant-payment auto-created ones) and `Sponsor`
 * (Paid) rows predate the cutover and haven't been backfilled into the
 * ledger yet.
 *
 * Deliberately does NOT also sum EventParticipant.totalPrice: doing so
 * would double-count every card-paid registration, which is already in the
 * ledger. The one known gap this leaves is historical cash/check
 * registrations recorded before the ledger cutover — those are closed by
 * running scripts/migrate-legacy-finance-to-fin-model.ts, not by blending
 * participant rows in here.
 */
export async function getCombinedEventIncomeTotal(eventId: string, eventName: string): Promise<number> {
  const [ledgerIncome, legacyIncomeRows, legacySponsorRows, migratedIncomeIds, migratedSponsorIds] = await Promise.all([
    getEventFinancialSummary(eventId).then((s) => s.totalIncome),
    prisma.income.findMany({
      where: { OR: [{ eventId }, { eventId: null, eventName }] },
    }),
    prisma.sponsor.findMany({
      where: { status: 'Paid', OR: [{ eventId }, { eventId: null, eventName }] },
    }),
    getMigratedLegacyIds('income'),
    getMigratedLegacyIds('sponsor'),
  ]);

  const legacyManualIncome = legacyIncomeRows
    .filter((r) => !(r.notes || '').toLowerCase().includes('auto-created from') && !migratedIncomeIds.has(r.id))
    .reduce((s, r) => s + r.amount, 0);
  const legacySponsorIncome = legacySponsorRows
    .filter((r) => !migratedSponsorIds.has(r.id))
    .reduce((s, r) => s + r.amount, 0);

  return ledgerIncome + legacyManualIncome + legacySponsorIncome;
}
