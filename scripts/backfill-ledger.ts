/**
 * Backfill ledger entries from existing income and expense records.
 * Skips any income/expense that already has a ledger entry (referenceId + referenceType).
 *
 * Run: npx tsx scripts/backfill-ledger.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { createLedgerEntry } from '../src/lib/services/ledger.service';
import type { CreateLedgerEntryInput } from '../src/lib/services/ledger.service';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not found. Set it in .env.development.local or .env.local');
  process.exit(1);
}

const adapter = new PrismaNeonHttp(connectionString, { fullResults: true });
const prisma = new PrismaClient({ adapter });

const VALID_PAYMENT_METHODS: CreateLedgerEntryInput['paymentMethod'][] = [
  'PAYPAL',
  'ZELLE',
  'SQUARE',
  'CASH',
  'CHECK',
  'BANK',
];

function incomeTypeToLedgerSource(incomeType: string): CreateLedgerEntryInput['source'] {
  const t = (incomeType || '').toLowerCase();
  if (t.includes('membership')) return 'MEMBERSHIP';
  if (t.includes('event') || t.includes('guest fee')) return 'EVENT';
  if (t.includes('sponsor')) return 'SPONSOR';
  if (t.includes('donation')) return 'DONATION';
  if (t.includes('refund')) return 'REIMBURSEMENT';
  return 'ADJUSTMENT';
}

function expenseToLedgerSource(
  expenseType: string,
  needsReimbursement: string
): CreateLedgerEntryInput['source'] {
  if (String(needsReimbursement || '').toLowerCase() === 'true') return 'REIMBURSEMENT';
  if ((expenseType || '').toLowerCase() === 'event') return 'EVENT';
  return 'ADJUSTMENT';
}

function parseDate(dateStr: string, fallback: Date): Date {
  if (!dateStr || dateStr.trim() === '') return fallback;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? fallback : d;
}

function toPaymentMethod(
  value: string | null | undefined
): CreateLedgerEntryInput['paymentMethod'] | null {
  if (!value) return null;
  const u = value.toUpperCase();
  return VALID_PAYMENT_METHODS.includes(u as CreateLedgerEntryInput['paymentMethod'])
    ? (u as CreateLedgerEntryInput['paymentMethod'])
    : null;
}

async function main() {
  console.log('Backfilling ledger from income and expenses...\n');

  const existing = await prisma.ledgerEntry.findMany({
    where: { referenceType: { in: ['INCOME', 'EXPENSE'] } },
    select: { referenceId: true, referenceType: true },
  });
  const existingByRef = new Set(
    existing
      .filter((e) => e.referenceId != null)
      .map((e) => `${e.referenceType}:${e.referenceId}`)
  );

  let incomeCreated = 0;
  let incomeSkipped = 0;
  const incomes = await prisma.income.findMany({ orderBy: { date: 'asc' } });
  for (const row of incomes) {
    const key = `INCOME:${row.id}`;
    if (existingByRef.has(key)) {
      incomeSkipped++;
      continue;
    }
    const date = parseDate(row.date, new Date(row.createdAt || undefined));
    await createLedgerEntry({
      date,
      type: 'INCOME',
      source: incomeTypeToLedgerSource(row.incomeType),
      amount: row.amount,
      paymentMethod: toPaymentMethod(row.paymentMethod),
      referenceId: row.id,
      referenceType: 'INCOME',
      notes: row.notes || undefined,
    });
    existingByRef.add(key);
    incomeCreated++;
  }
  console.log(`Income: ${incomeCreated} ledger entries created, ${incomeSkipped} skipped (already had entry).`);

  let expenseCreated = 0;
  let expenseSkipped = 0;
  const expenses = await prisma.expense.findMany({ orderBy: { date: 'asc' } });
  for (const row of expenses) {
    const key = `EXPENSE:${row.id}`;
    if (existingByRef.has(key)) {
      expenseSkipped++;
      continue;
    }
    const date = parseDate(row.date, new Date(row.createdAt || undefined));
    await createLedgerEntry({
      date,
      type: 'EXPENSE',
      source: expenseToLedgerSource(row.expenseType, row.needsReimbursement),
      amount: row.amount,
      referenceId: row.id,
      referenceType: 'EXPENSE',
      notes: row.description || row.notes || undefined,
    });
    existingByRef.add(key);
    expenseCreated++;
  }
  console.log(`Expense: ${expenseCreated} ledger entries created, ${expenseSkipped} skipped (already had entry).`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
