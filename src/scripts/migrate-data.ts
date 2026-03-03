/**
 * Data Migration Script: Google Sheets → Neon Postgres
 *
 * Usage: npm run db:seed
 *
 * Reads all data from Google Sheets using the existing google-sheets.ts module,
 * transforms it, and inserts into Postgres via Prisma.
 *
 * Migration order (parents before children):
 * 1. Settings, CommitteeMembers (no deps)
 * 2. Members, Guests (no deps)
 * 3. Events (no deps)
 * 4. EventParticipants (depends on Events, Members, Guests)
 * 5. Income, Expenses, Sponsors (optional FK to Events via eventName lookup)
 * 6. Transactions (no FK deps)
 * 7. ActivityLog (no deps)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.development.local' });
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { getRows } from '../lib/google-sheets';

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

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function safeFloat(val: string | undefined): number {
  const n = parseFloat(val || '0');
  return Number.isFinite(n) ? n : 0;
}

function safeInt(val: string | undefined): number {
  const n = parseInt(val || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function safeJson(val: string | undefined): unknown | null {
  if (!val || val.trim() === '') return null;
  try { return JSON.parse(val); } catch { return null; }
}

function membershipYearsToArray(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

async function insertAll<T>(
  items: T[],
  createFn: (item: T) => Promise<unknown>,
  label: string,
) {
  let created = 0;
  let skipped = 0;
  for (const item of items) {
    try {
      await createFn(item);
      created++;
    } catch (e: any) {
      if (e?.code === 'P2002') { skipped++; } // unique constraint = duplicate
      else throw e;
    }
    process.stdout.write(`\r  ${label}: ${created}/${items.length}${skipped ? ` (${skipped} dupes)` : ''}`);
  }
  console.log();
}

async function migrateSettings() {
  console.log('\n--- Settings ---');
  const rows = await getRows(SHEET_TABS.SETTINGS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.key)
    .map(r => ({
      key: r.key,
      value: r.value || '',
      updatedAt: r.updatedAt || '',
      updatedBy: r.updatedBy || '',
    }));

  await insertAll(data, item => prisma.setting.upsert({
    where: { key: item.key },
    update: item,
    create: item,
  }), 'Settings');
}

async function migrateCommitteeMembers() {
  console.log('\n--- Committee Members ---');
  const rows = await getRows(SHEET_TABS.COMMITTEE_MEMBERS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.email)
    .map(r => ({
      email: r.email.trim().toLowerCase(),
      role: r.role || '',
      addedAt: r.addedAt || '',
      addedBy: r.addedBy || '',
      notes: r.notes || '',
    }));

  await insertAll(data, item => prisma.committeeMember.upsert({
    where: { email: item.email },
    update: item,
    create: item,
  }), 'CommitteeMembers');
}

async function migrateMembers() {
  console.log('\n--- Members ---');
  const rows = await getRows(SHEET_TABS.MEMBERS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name || '',
      address: r.address || '',
      email: r.email || '',
      phone: r.phone || '',
      spouseName: r.spouseName || '',
      spouseEmail: r.spouseEmail || '',
      spousePhone: r.spousePhone || '',
      children: safeJson(r.children),
      membershipType: r.membershipType || 'Yearly',
      membershipYears: membershipYearsToArray(r.membershipYears),
      registrationDate: r.registrationDate || '',
      renewalDate: r.renewalDate || '',
      status: r.status || 'Active',
      notes: r.notes || '',
      loginEmail: r.loginEmail || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
    }));

  await insertAll(data, item => prisma.member.create({ data: item }), 'Members');
}

async function migrateGuests() {
  console.log('\n--- Guests ---');
  const rows = await getRows(SHEET_TABS.GUESTS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      city: r.city || '',
      referredBy: r.referredBy || '',
      eventsAttended: safeInt(r.eventsAttended),
      lastEventDate: r.lastEventDate || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
    }));

  await insertAll(data, item => prisma.guest.create({ data: item }), 'Guests');
}

async function migrateEvents() {
  console.log('\n--- Events ---');
  const rows = await getRows(SHEET_TABS.EVENTS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name || '',
      date: r.date || '',
      description: r.description || '',
      status: r.status || 'Upcoming',
      parentEventId: r.parentEventId || '',
      pricingRules: safeJson(r.pricingRules),
      formConfig: safeJson(r.formConfig),
      activities: safeJson(r.activities),
      activityPricingMode: r.activityPricingMode || '',
      guestPolicy: safeJson(r.guestPolicy),
      registrationOpen: r.registrationOpen || '',
      createdAt: r.createdAt || '',
    }));

  await insertAll(data, item => prisma.event.create({ data: item }), 'Events');
}

async function migrateEventParticipants() {
  console.log('\n--- Event Participants ---');
  const rows = await getRows(SHEET_TABS.EVENT_PARTICIPANTS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  // Validate FKs: get existing event/member/guest IDs
  const [eventIds, memberIds, guestIds] = await Promise.all([
    prisma.event.findMany({ select: { id: true } }).then(r => new Set(r.map(x => x.id))),
    prisma.member.findMany({ select: { id: true } }).then(r => new Set(r.map(x => x.id))),
    prisma.guest.findMany({ select: { id: true } }).then(r => new Set(r.map(x => x.id))),
  ]);

  let skipped = 0;
  const data = rows
    .filter(r => {
      if (!r.id || !r.eventId) return false;
      if (!eventIds.has(r.eventId)) { skipped++; return false; }
      return true;
    })
    .map(r => ({
      id: r.id,
      eventId: r.eventId,
      type: r.type || '',
      memberId: r.memberId && memberIds.has(r.memberId) ? r.memberId : null,
      guestId: r.guestId && guestIds.has(r.guestId) ? r.guestId : null,
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      registeredAdults: r.registeredAdults || '',
      registeredKids: r.registeredKids || '',
      registeredAt: r.registeredAt || '',
      actualAdults: r.actualAdults || '',
      actualKids: r.actualKids || '',
      checkedInAt: r.checkedInAt || '',
      selectedActivities: safeJson(r.selectedActivities),
      customFields: safeJson(r.customFields),
      totalPrice: r.totalPrice || '0',
      priceBreakdown: safeJson(r.priceBreakdown),
      paymentStatus: r.paymentStatus || '',
      paymentMethod: r.paymentMethod || '',
      transactionId: r.transactionId || '',
    }));

  if (skipped > 0) console.log(`  Skipped ${skipped} rows with missing event FK`);
  await insertAll(data, item => prisma.eventParticipant.create({ data: item }), 'EventParticipants');
}

async function migrateIncome() {
  console.log('\n--- Income ---');
  const rows = await getRows(SHEET_TABS.INCOME);
  console.log(`  Found ${rows.length} rows in Sheets`);

  // Build eventName → eventId map
  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameMap = new Map<string, string>();
  for (const e of events) eventNameMap.set(e.name, e.id);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      incomeType: r.incomeType || 'Other',
      eventName: r.eventName || '',
      eventId: r.eventName ? eventNameMap.get(r.eventName) || null : null,
      amount: safeFloat(r.amount),
      date: r.date || '',
      paymentMethod: r.paymentMethod || '',
      payerName: r.payerName || '',
      notes: r.notes || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
    }));

  await insertAll(data, item => prisma.income.create({ data: item }), 'Income');
}

async function migrateExpenses() {
  console.log('\n--- Expenses ---');
  const rows = await getRows(SHEET_TABS.EXPENSES);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameMap = new Map<string, string>();
  for (const e of events) eventNameMap.set(e.name, e.id);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      expenseType: r.expenseType || 'General',
      eventName: r.eventName || '',
      eventId: r.eventName ? eventNameMap.get(r.eventName) || null : null,
      category: r.category || 'Miscellaneous',
      description: r.description || '',
      amount: safeFloat(r.amount),
      date: r.date || '',
      paidBy: r.paidBy || 'Organization',
      receiptUrl: r.receiptUrl || '',
      receiptFileId: r.receiptFileId || '',
      notes: r.notes || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
      needsReimbursement: r.needsReimbursement || '',
      reimbStatus: r.reimbStatus || '',
      reimbMethod: r.reimbMethod || '',
      reimbAmount: safeFloat(r.reimbAmount),
      approvedBy: r.approvedBy || '',
      approvedDate: r.approvedDate || '',
      reimbursedDate: r.reimbursedDate || '',
    }));

  await insertAll(data, item => prisma.expense.create({ data: item }), 'Expenses');
}

async function migrateSponsors() {
  console.log('\n--- Sponsors ---');
  const rows = await getRows(SHEET_TABS.SPONSORS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const eventNameMap = new Map<string, string>();
  for (const e of events) eventNameMap.set(e.name, e.id);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      type: r.type || 'Annual',
      amount: safeFloat(r.amount),
      eventName: r.eventName || '',
      eventId: r.eventName ? eventNameMap.get(r.eventName) || null : null,
      year: r.year || '',
      paymentMethod: r.paymentMethod || '',
      paymentDate: r.paymentDate || '',
      status: r.status || 'Pending',
      notes: r.notes || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
    }));

  await insertAll(data, item => prisma.sponsor.create({ data: item }), 'Sponsors');
}

async function migrateTransactions() {
  console.log('\n--- Transactions ---');
  const rows = await getRows(SHEET_TABS.TRANSACTIONS);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      externalId: r.externalId || '',
      source: r.source || '',
      amount: safeFloat(r.amount),
      fee: safeFloat(r.fee),
      netAmount: safeFloat(r.netAmount),
      description: r.description || '',
      payerName: r.payerName || '',
      payerEmail: r.payerEmail || '',
      date: r.date || '',
      tag: r.tag || '',
      eventName: r.eventName || '',
      syncedAt: r.syncedAt || '',
      notes: r.notes || '',
    }));

  await insertAll(data, item => prisma.transaction.create({ data: item }), 'Transactions');
}

async function migrateActivityLog() {
  console.log('\n--- Activity Log ---');
  const rows = await getRows(SHEET_TABS.ACTIVITY_LOG);
  console.log(`  Found ${rows.length} rows in Sheets`);

  const data = rows
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      timestamp: r.timestamp || '',
      userEmail: r.userEmail || '',
      action: r.action || '',
      entityType: r.entityType || '',
      entityId: r.entityId || '',
      entityLabel: r.entityLabel || '',
      description: r.description || '',
      changedFields: safeJson(r.changedFields),
      oldValues: safeJson(r.oldValues),
      newValues: safeJson(r.newValues),
    }));

  await insertAll(data, item => prisma.activityLog.create({ data: item }), 'ActivityLog');
}

async function main() {
  console.log('=== Google Sheets → Neon Postgres Migration ===');
  console.log(`Database: ${process.env.DATABASE_URL?.replace(/\/\/.*:.*@/, '//***:***@')}`);

  try {
    // Phase 1: No dependencies
    await migrateSettings();
    await migrateCommitteeMembers();

    // Phase 2: No dependencies
    await migrateMembers();
    await migrateGuests();

    // Phase 3: No dependencies
    await migrateEvents();

    // Phase 4: Depends on Events, Members, Guests
    await migrateEventParticipants();

    // Phase 5: Optional FK to Events via eventName lookup
    await migrateIncome();
    await migrateExpenses();
    await migrateSponsors();

    // Phase 6: No FK deps
    await migrateTransactions();

    // Phase 7: No deps
    await migrateActivityLog();

    console.log('\n=== Migration Complete ===');
  } catch (error) {
    console.error('\n!!! Migration FAILED !!!', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
