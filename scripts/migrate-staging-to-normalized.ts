/**
 * Migrate data from raw_member_imports staging table to normalized member tables.
 * Run: npx tsx scripts/migrate-staging-to-normalized.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaNeonHttp(connectionString, { fullResults: true });
const prisma = new PrismaClient({ adapter });

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

const CURRENT_YEAR = '2026';

/** Normalize membership status strings to canonical values. Returns null to skip. */
function normalizeStatus(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s === 'N/A' || s === 'NO' || s === 'NONE' || s === '-') return null;
  if (s.includes('LIFE')) return 'Life Member';
  if (s === 'ACTIVE' || s.startsWith('ACTIVE') || s === 'CURRENT' || s.startsWith('CURRENT') || s === 'YES' || s === 'RENEWED') return 'Active';
  if (s === 'NOT RENEWED' || s === 'LAPSED') return 'Not Renewed';
  if (s === 'EXPIRED') return 'Expired';
  // Unknown non-empty value — treat as Active
  return 'Active';
}

/** Determine if member is a life member from lifeMember field OR any status column */
function isLifeMember(raw: {
  lifeMember: string;
  status2024: string; status2025: string; status2026: string;
  status2027: string; status2028: string; status2029: string;
}): boolean {
  if (raw.lifeMember.trim().toUpperCase() === 'YES') return true;
  return [raw.status2024, raw.status2025, raw.status2026, raw.status2027, raw.status2028, raw.status2029]
    .some(s => s.toUpperCase().includes('LIFE'));
}

/** Determine overall member status: Life Members always Active, others based on current year */
function computeOverallStatus(
  life: boolean,
  yearStatuses: { year: string; status: string }[],
): string {
  if (life) return 'Active';
  const currentYear = yearStatuses.find(ys => ys.year === CURRENT_YEAR);
  if (currentYear) return 'Active';
  return 'Not Renewed';
}

/** Parse PayPal payment info text into structured data */
function parsePaypalPayment(text: string): {
  product: string;
  amount: string;
  payerName: string;
  payerEmail: string;
  transactionId: string;
} | null {
  if (!text.trim()) return null;
  const result = {
    product: '',
    amount: '',
    payerName: '',
    payerEmail: '',
    transactionId: '',
  };

  // Try to extract transaction ID (alphanumeric, typically 17+ chars)
  const txMatch = text.match(/\b([A-Z0-9]{17,})\b/);
  if (txMatch) result.transactionId = txMatch[1];

  // Try to extract amount ($XX.XX pattern)
  const amtMatch = text.match(/\$?([\d,]+\.?\d*)/);
  if (amtMatch) result.amount = amtMatch[1].replace(',', '');

  // Try to extract email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) result.payerEmail = emailMatch[0];

  // Product is usually the first meaningful line
  const lines = text.split(/\n|,/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) result.product = lines[0].substring(0, 200);

  // Payer name extraction - try common patterns
  const nameMatch = text.match(/(?:from|by|payer:?)\s+([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (nameMatch) result.payerName = nameMatch[1];

  return result;
}

async function main() {
  console.log('Starting migration from raw_member_imports to normalized tables...');

  // Fetch all unmigrated raw imports
  const rawRows = await prisma.rawMemberImport.findMany({
    where: { migrated: '' },
    orderBy: { submittedAt: 'desc' },
  });
  console.log(`Found ${rawRows.length} unmigrated rows`);

  if (rawRows.length === 0) {
    console.log('Nothing to migrate');
    return;
  }

  // Deduplicate by email (keep most recent submission per email)
  const byEmail = new Map<string, typeof rawRows[0]>();
  const noEmail: typeof rawRows = [];

  for (const row of rawRows) {
    const email = safeStr(row.email).toLowerCase();
    if (!email) {
      noEmail.push(row);
      continue;
    }
    if (!byEmail.has(email)) {
      byEmail.set(email, row);
    }
    // Skip older duplicate — already ordered by submittedAt desc
  }

  const uniqueRows = [... Array.from(byEmail.values()), ...noEmail];
  console.log(`After dedup: ${uniqueRows.length} unique members (${rawRows.length - uniqueRows.length} duplicates skipped)`);

  const now = new Date().toISOString();
  let created = 0;
  let errors = 0;

  for (const raw of uniqueRows) {
    try {
      // 1. Compute membership data
      const life = isLifeMember(raw);
      const membershipType = life ? 'Life Member' : 'Yearly';
      const yearStatuses: { year: string; status: string }[] = [];

      const yearFields = [
        { year: '2024', value: raw.status2024 },
        { year: '2025', value: raw.status2025 },
        { year: '2026', value: raw.status2026 },
        { year: '2027', value: raw.status2027 },
        { year: '2028', value: raw.status2028 },
        { year: '2029', value: raw.status2029 },
      ];

      if (life) {
        // Life members get Life Member status for ALL years
        for (const { year } of yearFields) {
          yearStatuses.push({ year, status: 'Life Member' });
        }
      } else {
        for (const { year, value } of yearFields) {
          const normalized = normalizeStatus(value);
          if (normalized) {
            yearStatuses.push({ year, status: normalized });
          }
        }
      }

      const overallStatus = computeOverallStatus(life, yearStatuses);

      // 2. Create Member
      const member = await prisma.member.create({
        data: {
          firstName: safeStr(raw.firstName),
          middleName: safeStr(raw.middleName),
          lastName: safeStr(raw.lastName),
          email: safeStr(raw.email).toLowerCase(),
          phone: safeStr(raw.cellPhone) || safeStr(raw.homePhone),
          homePhone: safeStr(raw.homePhone),
          cellPhone: safeStr(raw.cellPhone),
          qualifyingDegree: safeStr(raw.qualifyingDegree),
          nativePlace: safeStr(raw.nativePlace),
          college: safeStr(raw.college),
          jobTitle: safeStr(raw.jobTitle),
          employer: safeStr(raw.employer),
          specialInterests: safeStr(raw.specialInterests),
          submissionId: safeStr(raw.submissionId),
          membershipType,
          status: overallStatus,
          registrationDate: safeStr(raw.submittedAt).split('T')[0] || now.split('T')[0],
          createdAt: now,
          updatedAt: now,
        },
      });

      // 3. Create Address (if any address data)
      if (raw.street || raw.city || raw.state || raw.zipCode || raw.country || raw.street2) {
        await prisma.memberAddress.create({
          data: {
            memberId: member.id,
            street: safeStr(raw.street),
            street2: safeStr(raw.street2),
            city: safeStr(raw.city),
            state: safeStr(raw.state),
            zipCode: safeStr(raw.zipCode),
            country: safeStr(raw.country),
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 4. Create Spouse (if any spouse data)
      if (raw.spouseFirstName || raw.spouseEmail) {
        await prisma.memberSpouse.create({
          data: {
            memberId: member.id,
            firstName: safeStr(raw.spouseFirstName),
            middleName: safeStr(raw.spouseMiddleName),
            lastName: safeStr(raw.spouseLastName),
            email: safeStr(raw.spouseEmail).toLowerCase(),
            phone: safeStr(raw.spousePhone),
            nativePlace: safeStr(raw.spouseNativePlace),
            company: safeStr(raw.spouseCompany),
            college: safeStr(raw.spouseCollege),
            qualifyingDegree: safeStr(raw.spouseQualifyingDegree),
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 5. Create Children (up to 4 slots)
      const childSlots = [
        { name: raw.child1Name, sex: raw.child1Sex, grade: raw.child1Grade, age: raw.child1Age, dob: raw.child1Dob },
        { name: raw.child2Name, sex: raw.child2Sex, grade: raw.child2Grade, age: raw.child2Age, dob: raw.child2Dob },
        { name: raw.child3Name, sex: raw.child3Sex, grade: raw.child3Grade, age: raw.child3Age, dob: raw.child3Dob },
        { name: raw.child4Name, sex: raw.child4Sex, grade: raw.child4Grade, age: raw.child4Age, dob: raw.child4Dob },
      ];

      for (let i = 0; i < childSlots.length; i++) {
        const child = childSlots[i];
        if (!child.name.trim()) continue;
        await prisma.memberChild.create({
          data: {
            memberId: member.id,
            name: safeStr(child.name),
            sex: safeStr(child.sex),
            grade: safeStr(child.grade),
            age: safeStr(child.age),
            dateOfBirth: safeStr(child.dob),
            sortOrder: i + 1,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 6. Create Memberships
      for (const { year, status } of yearStatuses) {
        await prisma.memberMembership.create({
          data: {
            memberId: member.id,
            year,
            status,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 7. Create Payment (if PayPal info exists)
      const payment = parsePaypalPayment(safeStr(raw.paypalPaymentInfo));
      if (payment) {
        await prisma.memberPayment.create({
          data: {
            memberId: member.id,
            product: payment.product,
            amount: payment.amount,
            payerName: payment.payerName,
            payerEmail: payment.payerEmail,
            transactionId: payment.transactionId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 8. Create Sponsor (if sponsor data exists)
      if (raw.sponsorName.trim()) {
        await prisma.memberSponsor.create({
          data: {
            memberId: member.id,
            name: safeStr(raw.sponsorName),
            email: safeStr(raw.sponsorEmail),
            phone: safeStr(raw.sponsorPhone),
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // Mark this raw row as migrated
      await prisma.rawMemberImport.update({
        where: { id: raw.id },
        data: { migrated: 'yes', updatedAt: now },
      });

      created++;
      if (created % 50 === 0) console.log(`  ...created ${created} members`);
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`Error migrating row (email: ${raw.email}):`, err);
      } else if (errors === 6) {
        console.error('(suppressing further error details...)');
      }
    }
  }

  // 9. Mark duplicate rows as migrated too
  const uniqueIds = new Set(uniqueRows.map(r => r.id));
  const dupeRows = rawRows.filter(r => !uniqueIds.has(r.id));
  for (const dupe of dupeRows) {
    try {
      await prisma.rawMemberImport.update({
        where: { id: dupe.id },
        data: { migrated: 'yes', updatedAt: now },
      });
    } catch { /* ignore */ }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Members created: ${created}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Duplicates skipped: ${dupeRows.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
