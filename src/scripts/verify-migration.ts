/**
 * Migration Verification Script
 *
 * Usage: npm run db:verify
 *
 * Compares row counts between Google Sheets and Postgres,
 * spot-checks random records, and verifies FK integrity.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.development.local' });
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { getRows } from '../lib/google-sheets';

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true });

const SHEET_TABS = {
  INCOME: 'Income',
  SPONSORS: 'Sponsors',
  EXPENSES: 'Expenses',
  TRANSACTIONS: 'Transactions',
  EVENTS: 'Events',
  MEMBERS: 'Members',
  GUESTS: 'Guests',
  EVENT_PARTICIPANTS: 'EventParticipants',
  COMMITTEE_MEMBERS: 'Committee Members',
  SETTINGS: 'Settings',
  ACTIVITY_LOG: 'ActivityLog',
} as const;

const prisma = new PrismaClient({ adapter });
let failures = 0;

function pass(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(msg: string) { console.log(`  ✗ ${msg}`); failures++; }

async function verifyRowCounts() {
  console.log('\n--- Row Count Comparison ---');

  const checks: { sheet: string; count: () => Promise<number> }[] = [
    { sheet: SHEET_TABS.SETTINGS, count: () => prisma.setting.count() },
    { sheet: SHEET_TABS.COMMITTEE_MEMBERS, count: () => prisma.committeeMember.count() },
    { sheet: SHEET_TABS.MEMBERS, count: () => prisma.member.count() },
    { sheet: SHEET_TABS.GUESTS, count: () => prisma.guest.count() },
    { sheet: SHEET_TABS.EVENTS, count: () => prisma.event.count() },
    { sheet: SHEET_TABS.EVENT_PARTICIPANTS, count: () => prisma.eventParticipant.count() },
    { sheet: SHEET_TABS.INCOME, count: () => prisma.income.count() },
    { sheet: SHEET_TABS.EXPENSES, count: () => prisma.expense.count() },
    { sheet: SHEET_TABS.SPONSORS, count: () => prisma.sponsor.count() },
    { sheet: SHEET_TABS.TRANSACTIONS, count: () => prisma.transaction.count() },
    { sheet: SHEET_TABS.ACTIVITY_LOG, count: () => prisma.activityLog.count() },
  ];

  for (const { sheet, count } of checks) {
    try {
      const sheetRows = await getRows(sheet);
      const dbCount = await count();
      const sheetCount = sheetRows.filter(r => {
        // Settings use 'key', committee uses 'email', rest use 'id'
        if (sheet === SHEET_TABS.SETTINGS) return !!r.key;
        if (sheet === SHEET_TABS.COMMITTEE_MEMBERS) return !!r.email;
        return !!r.id;
      }).length;

      if (dbCount === sheetCount) {
        pass(`${sheet}: ${dbCount} rows match`);
      } else {
        fail(`${sheet}: Sheets=${sheetCount}, Postgres=${dbCount} (diff: ${dbCount - sheetCount})`);
      }
    } catch (error) {
      fail(`${sheet}: Error - ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function spotCheckRecords() {
  console.log('\n--- Spot Checks (10 random per table) ---');

  // Members
  const sheetMembers = await getRows(SHEET_TABS.MEMBERS);
  const sampleMembers = sheetMembers.sort(() => Math.random() - 0.5).slice(0, 10);
  let memberHits = 0;
  for (const sm of sampleMembers) {
    if (!sm.id) continue;
    const db = await prisma.member.findUnique({ where: { id: sm.id } });
    if (db && db.name === sm.name && db.email === sm.email) memberHits++;
  }
  if (memberHits === sampleMembers.length) {
    pass(`Members: ${memberHits}/${sampleMembers.length} spot checks passed`);
  } else {
    fail(`Members: ${memberHits}/${sampleMembers.length} spot checks passed`);
  }

  // Events
  const sheetEvents = await getRows(SHEET_TABS.EVENTS);
  const sampleEvents = sheetEvents.sort(() => Math.random() - 0.5).slice(0, 10);
  let eventHits = 0;
  for (const se of sampleEvents) {
    if (!se.id) continue;
    const db = await prisma.event.findUnique({ where: { id: se.id } });
    if (db && db.name === se.name && db.date === se.date) eventHits++;
  }
  if (eventHits === sampleEvents.length) {
    pass(`Events: ${eventHits}/${sampleEvents.length} spot checks passed`);
  } else {
    fail(`Events: ${eventHits}/${sampleEvents.length} spot checks passed`);
  }

  // Income
  const sheetIncome = await getRows(SHEET_TABS.INCOME);
  const sampleIncome = sheetIncome.sort(() => Math.random() - 0.5).slice(0, 10);
  let incomeHits = 0;
  for (const si of sampleIncome) {
    if (!si.id) continue;
    const db = await prisma.income.findUnique({ where: { id: si.id } });
    if (db && String(db.amount) === String(parseFloat(si.amount || '0'))) incomeHits++;
  }
  if (incomeHits === sampleIncome.length) {
    pass(`Income: ${incomeHits}/${sampleIncome.length} spot checks passed`);
  } else {
    fail(`Income: ${incomeHits}/${sampleIncome.length} spot checks passed`);
  }
}

async function verifyFkIntegrity() {
  console.log('\n--- FK Integrity ---');

  // EventParticipants → Events
  const orphanedParticipants = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM event_participants ep LEFT JOIN events e ON ep."eventId" = e.id WHERE e.id IS NULL`,
  );
  const orphanCount = Number(orphanedParticipants[0]?.count || 0);
  if (orphanCount === 0) {
    pass('No orphaned EventParticipants (all eventIds valid)');
  } else {
    fail(`${orphanCount} orphaned EventParticipants with missing eventId`);
  }

  // Income → Events (nullable FK)
  const orphanedIncome = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM income i WHERE i."eventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = i."eventId")`,
  );
  const orphanIncomeCount = Number(orphanedIncome[0]?.count || 0);
  if (orphanIncomeCount === 0) {
    pass('No orphaned Income records (all eventIds valid)');
  } else {
    fail(`${orphanIncomeCount} orphaned Income records with missing eventId`);
  }
}

async function main() {
  console.log('=== Migration Verification ===');

  try {
    await verifyRowCounts();
    await spotCheckRecords();
    await verifyFkIntegrity();

    console.log(`\n=== Verification Complete: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`} ===`);
    process.exit(failures > 0 ? 1 : 0);
  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
