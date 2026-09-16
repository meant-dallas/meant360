/**
 * One-time backfill: copy historical rows from the legacy finance tables
 * (Income, Expense, Sponsor — Paid only) into the unified ledger
 * (FinRawTransaction), so the Accounting dashboard/event pane/reports show
 * complete history instead of only what's been recorded there since the
 * write-path cutover.
 *
 * PREREQUISITE: apply the pending schema migration first —
 *   npx prisma migrate deploy
 * — this script reads FinCategory.code and writes the new FinRawTransaction
 * reimbursement/sponsorId fields added in prisma/migrations/20260915120000_unify_financial_ledger,
 * and will error out (safely — before writing anything) if that migration
 * hasn't been applied yet.
 *
 * NOT run automatically by anyone other than you. Review the --dry-run
 * output first — it changes nothing — then run for real when you're ready.
 *
 *   npx tsx scripts/migrate-legacy-finance-to-fin-model.ts --dry-run
 *   npx tsx scripts/migrate-legacy-finance-to-fin-model.ts
 *
 * Safe to re-run: every row this script creates is tagged with
 * `metadata.legacySourceTable` / `metadata.legacySourceId`, and a second run
 * skips anything already tagged for a given source row.
 *
 * Deliberately does NOT touch the legacy `Transaction` table — every row in
 * it was already dual-logged to FinRawTransaction at the time it was
 * created (see payments.service.ts's logFinTransaction), so migrating it
 * again would double-count that money.
 *
 * Deliberately skips "auto-created from registration/checkin" Income rows
 * whose paymentMethod is Square or PayPal: those payments already have a
 * FinRawTransaction row from the same logFinTransaction call, so migrating
 * the Income row too would double-count them. Cash/check/other-method
 * "auto-created" rows have no ledger counterpart and ARE migrated — this is
 * exactly the historical gap the write-path cutover in events.service.ts
 * left for anyone who paid a different way before this script runs.
 *
 * Pending Sponsor rows (status !== 'Paid') are NOT migrated — they're
 * pledges, not money that moved. Consider recording them as
 * FinAccountsReceivable by hand if you want them tracked.
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

const DRY_RUN = process.argv.includes('--dry-run');
const CARD_PAYMENT_METHODS = new Set(['square', 'paypal']);

interface Reconciliation {
  table: string;
  legacyRows: number;
  legacyTotal: number;
  migrated: number;
  migratedTotal: number;
  skippedAlreadyMigrated: number;
  skippedAlreadyInLedger: number;
  repairedEventId: number;
  prunedDuplicates: number;
}

function newReconciliation(table: string): Reconciliation {
  return { table, legacyRows: 0, legacyTotal: 0, migrated: 0, migratedTotal: 0, skippedAlreadyMigrated: 0, skippedAlreadyInLedger: 0, repairedEventId: 0, prunedDuplicates: 0 };
}

async function findMigratedRow(table: string, id: string) {
  return prisma.finRawTransaction.findFirst({
    where: {
      AND: [
        { metadata: { path: ['legacySourceTable'], equals: table } },
        { metadata: { path: ['legacySourceId'], equals: id } },
      ],
    },
    select: { id: true, eventId: true },
  });
}

/**
 * Legacy Income/Expense/Sponsor rows often only have `eventName` populated,
 * not `eventId` (that column was added later) — resolve through the name
 * when the id is missing, the same fallback every other part of the app
 * already uses for these tables.
 */
function resolveEventId(rowEventId: string | null, rowEventName: string | null | undefined, eventNameToId: Map<string, string>): string | null {
  if (rowEventId) return rowEventId;
  if (rowEventName) return eventNameToId.get(rowEventName) ?? null;
  return null;
}

async function resolveCategoryId(code: string, fallbackName?: string): Promise<string | null> {
  const byCode = await prisma.finCategory.findFirst({ where: { code } });
  if (byCode) return byCode.id;
  if (fallbackName) {
    const byName = await prisma.finCategory.findFirst({ where: { name: fallbackName } });
    if (byName) return byName.id;
  }
  return null;
}

/**
 * Does this legacy Income row already have a real (non-migrated) ledger
 * counterpart? Card payments (Square/PayPal) always flowed through
 * payments.service.ts's logFinTransaction at charge time — the legacy
 * Income row for the same payment is a second, inferior record (no fee
 * data, wrong provider) of money already correctly on the ledger.
 *
 * Three checks, most precise first:
 *  1. notes contain "auto-created from" (events.service.ts's registration/
 *     check-in income marker) — this path ALWAYS ran alongside a card
 *     charge already logged via logFinTransaction, so it's a guaranteed
 *     match with no further evidence needed.
 *  2. The row's notes end in "(<transactionId>)" or "- <transactionId>" —
 *     both patterns older code paths used — and that id matches a real
 *     FinRawTransaction.externalId exactly.
 *  3. No embedded id (some code paths, e.g. the old membership-approval
 *     flow, never recorded one — that flow also had no dedup check at all,
 *     so it's a known source of pre-existing double-booked Income rows):
 *     fall back to matching by payer name + Membership category + provider
 *     within a week of a genuine (non-migrated) ledger row for that payer.
 *     A false positive here (treating two real separate payments as one)
 *     is unlikely for a small nonprofit's volume, and safer than
 *     permanently baking a known historical double-entry into the ledger.
 */
async function hasGenuineLedgerMatch(
  row: { amount: number; date: string; paymentMethod: string; notes: string | null; payerName: string; incomeType: string },
  membershipCategoryId: string | null,
): Promise<boolean> {
  const provider = (row.paymentMethod || '').toLowerCase();
  if (!CARD_PAYMENT_METHODS.has(provider)) return false;

  if ((row.notes || '').toLowerCase().includes('auto-created from')) return true;

  const embedded = row.notes?.match(/[(\-]\s*([A-Za-z0-9]{10,})\)?\s*$/)?.[1];
  if (embedded) {
    const exact = await prisma.finRawTransaction.findUnique({ where: { externalId: embedded } });
    if (exact) return true;
  }

  if (row.incomeType === 'Membership' && row.payerName && membershipCategoryId) {
    const rowDate = new Date(row.date);
    if (!isNaN(rowDate.getTime())) {
      const windowStart = new Date(rowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(rowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const candidates = await prisma.finRawTransaction.findMany({
        where: {
          provider,
          categoryId: membershipCategoryId,
          payerName: { equals: row.payerName, mode: 'insensitive' },
          transactionDate: { gte: windowStart, lte: windowEnd },
        },
        select: { metadata: true },
      });
      if (candidates.some((c) => !(c.metadata as { legacySourceTable?: string } | null)?.legacySourceTable)) return true;
    }
  }

  return false;
}

async function migrateIncome(eventNameToId: Map<string, string>): Promise<Reconciliation> {
  const rows = await prisma.income.findMany();
  const rec = newReconciliation('income');
  rec.legacyRows = rows.length;
  const eventIncomeCategoryId = await resolveCategoryId('event_income', 'Event Income');
  const membershipCategoryId = await resolveCategoryId('membership', 'Membership');
  const otherCategoryId = await resolveCategoryId('donation', 'Donation');

  for (const row of rows) {
    rec.legacyTotal += row.amount;

    const genuineMatch = await hasGenuineLedgerMatch(row, membershipCategoryId);
    const existing = await findMigratedRow('income', row.id);

    if (existing) {
      if (genuineMatch) {
        // A real ledger row for this payment exists (card payment dual-write,
        // or a pre-existing double-booked Income row) — this migrated copy
        // is a confirmed duplicate, not just a possible one. Remove it.
        if (!DRY_RUN) await prisma.finRawTransaction.delete({ where: { id: existing.id } });
        rec.prunedDuplicates++;
        continue;
      }
      const resolvedEventId = resolveEventId(row.eventId, row.eventName, eventNameToId);
      if (!existing.eventId && resolvedEventId) {
        if (!DRY_RUN) await prisma.finRawTransaction.update({ where: { id: existing.id }, data: { eventId: resolvedEventId } });
        rec.repairedEventId++;
      }
      rec.skippedAlreadyMigrated++;
      continue;
    }

    if (genuineMatch) {
      rec.skippedAlreadyInLedger++;
      continue;
    }

    const resolvedEventId = resolveEventId(row.eventId, row.eventName, eventNameToId);
    const categoryId = row.incomeType === 'Membership'
      ? membershipCategoryId
      : resolvedEventId
        ? eventIncomeCategoryId
        : otherCategoryId;

    if (!DRY_RUN) {
      await prisma.finRawTransaction.create({
        data: {
          provider: 'manual',
          type: row.amount < 0 ? 'refund' : 'income',
          grossAmount: new Prisma.Decimal(row.amount),
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(row.amount),
          payerName: row.payerName || null,
          description: `${row.incomeType || 'Income'}${row.eventName ? `: ${row.eventName}` : ''}`,
          transactionDate: new Date(row.date || row.createdAt || Date.now()),
          status: 'Completed',
          categoryId,
          eventId: resolvedEventId,
          notes: row.notes || null,
          metadata: { legacySourceTable: 'income', legacySourceId: row.id } as Prisma.InputJsonValue,
        },
      });
    }
    rec.migrated++;
    rec.migratedTotal += row.amount;
  }

  return rec;
}

async function migrateExpenses(eventNameToId: Map<string, string>): Promise<Reconciliation> {
  const rows = await prisma.expense.findMany();
  const rec = newReconciliation('expense');
  rec.legacyRows = rows.length;

  // Cache category lookups by legacy free-text name so we don't hit the DB
  // once per row for a small, repetitive set of category strings.
  const categoryCache = new Map<string, string | null>();
  const resolveExpenseCategory = async (name: string): Promise<string | null> => {
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const found = await prisma.finCategory.findFirst({ where: { name, type: 'expense' } });
    categoryCache.set(name, found?.id ?? null);
    return found?.id ?? null;
  };

  for (const row of rows) {
    rec.legacyTotal += row.amount;

    const resolvedEventId = resolveEventId(row.eventId, row.eventName, eventNameToId);

    const existing = await findMigratedRow('expense', row.id);
    if (existing) {
      if (!existing.eventId && resolvedEventId) {
        if (!DRY_RUN) await prisma.finRawTransaction.update({ where: { id: existing.id }, data: { eventId: resolvedEventId } });
        rec.repairedEventId++;
      }
      rec.skippedAlreadyMigrated++;
      continue;
    }

    const categoryId = await resolveExpenseCategory(row.category || 'Miscellaneous');
    const hasReimbursement = row.needsReimbursement === 'true' && !!row.reimbStatus;

    if (!DRY_RUN) {
      await prisma.finRawTransaction.create({
        data: {
          provider: 'manual',
          type: 'expense',
          grossAmount: new Prisma.Decimal(row.amount),
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(row.amount),
          payerName: row.paidBy || null,
          description: `${row.description || row.expenseType || 'Expense'}${row.eventName ? `: ${row.eventName}` : ''}`,
          transactionDate: new Date(row.date || row.createdAt || Date.now()),
          status: 'Completed',
          categoryId,
          eventId: resolvedEventId,
          notes: row.notes || null,
          receiptUrl: row.receiptUrl || null,
          receiptFileId: row.receiptFileId || null,
          reimbursementStatus: hasReimbursement ? row.reimbStatus : null,
          reimbursementMethod: hasReimbursement ? row.reimbMethod || null : null,
          reimbursementAmount: hasReimbursement ? new Prisma.Decimal(row.reimbAmount || 0) : null,
          approvedBy: hasReimbursement ? row.approvedBy || null : null,
          approvedDate: hasReimbursement && row.approvedDate ? new Date(row.approvedDate) : null,
          reimbursedDate: hasReimbursement && row.reimbursedDate ? new Date(row.reimbursedDate) : null,
          metadata: { legacySourceTable: 'expense', legacySourceId: row.id } as Prisma.InputJsonValue,
        },
      });
    }
    rec.migrated++;
    rec.migratedTotal += row.amount;
  }

  return rec;
}

async function migrateSponsors(eventNameToId: Map<string, string>): Promise<Reconciliation> {
  const rows = await prisma.sponsor.findMany({ where: { status: 'Paid' } });
  const rec = newReconciliation('sponsor (Paid only)');
  rec.legacyRows = rows.length;
  const sponsorshipCategoryId = await resolveCategoryId('sponsorship', 'Sponsorship');

  for (const row of rows) {
    rec.legacyTotal += row.amount;

    const resolvedEventId = row.type === 'Event' ? resolveEventId(row.eventId, row.eventName, eventNameToId) : null;

    const existing = await findMigratedRow('sponsor', row.id);
    if (existing) {
      if (!existing.eventId && resolvedEventId) {
        if (!DRY_RUN) await prisma.finRawTransaction.update({ where: { id: existing.id }, data: { eventId: resolvedEventId } });
        rec.repairedEventId++;
      }
      rec.skippedAlreadyMigrated++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.finRawTransaction.create({
        data: {
          provider: 'manual',
          type: 'income',
          grossAmount: new Prisma.Decimal(row.amount),
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(row.amount),
          payerName: row.name || null,
          description: `Sponsorship: ${row.name}${row.eventName ? ` (${row.eventName})` : ''}`,
          transactionDate: new Date(row.paymentDate || row.createdAt || Date.now()),
          status: 'Completed',
          categoryId: sponsorshipCategoryId,
          eventId: resolvedEventId,
          sponsorId: row.id,
          notes: row.notes || null,
          metadata: { legacySourceTable: 'sponsor', legacySourceId: row.id } as Prisma.InputJsonValue,
        },
      });
    }
    rec.migrated++;
    rec.migratedTotal += row.amount;
  }

  return rec;
}

function printReconciliation(rec: Reconciliation) {
  console.log(`\n--- ${rec.table} ---`);
  console.log(`  Legacy rows:              ${rec.legacyRows}  (total $${rec.legacyTotal.toFixed(2)})`);
  console.log(`  Migrated this run:        ${rec.migrated}  (total $${rec.migratedTotal.toFixed(2)})`);
  console.log(`  Skipped (already in ledger via card payment): ${rec.skippedAlreadyInLedger}`);
  console.log(`  Skipped (already migrated in a prior run):    ${rec.skippedAlreadyMigrated}`);
  if (rec.repairedEventId > 0) {
    console.log(`  Repaired eventId on already-migrated rows:    ${rec.repairedEventId}`);
  }
  if (rec.prunedDuplicates > 0) {
    console.log(`  Removed confirmed duplicate migrated rows:    ${rec.prunedDuplicates}`);
  }
  const accounted = rec.migrated + rec.skippedAlreadyInLedger + rec.skippedAlreadyMigrated + rec.prunedDuplicates;
  if (accounted !== rec.legacyRows) {
    console.log(`  ⚠️  ${rec.legacyRows - accounted} row(s) unaccounted for — investigate before trusting this table's totals.`);
  }
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — no data will be written.\n' : 'LIVE RUN — writing to the database.\n');

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameToId = new Map(events.map((e) => [e.name, e.id]));

  const results = [
    await migrateIncome(eventNameToId),
    await migrateExpenses(eventNameToId),
    await migrateSponsors(eventNameToId),
  ];

  results.forEach(printReconciliation);

  console.log(`\n${DRY_RUN ? 'Would migrate' : 'Migrated'} ${results.reduce((s, r) => s + r.migrated, 0)} rows total.`);
  const repaired = results.reduce((s, r) => s + r.repairedEventId, 0);
  if (repaired > 0) console.log(`${DRY_RUN ? 'Would repair' : 'Repaired'} eventId on ${repaired} previously-migrated row(s).`);
  if (DRY_RUN) console.log('Re-run without --dry-run to apply.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
