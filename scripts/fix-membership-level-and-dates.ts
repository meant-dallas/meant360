/**
 * Backfill membershipLevel and registrationDate.
 *
 * 1. registrationDate: Convert Excel serial numbers to YYYY-MM-DD, or use raw.submittedAt
 * 2. membershipLevel:
 *    - From raw.lifeMember if available (Family/Individual)
 *    - Otherwise: if member has a spouse → 'Family', else → 'Individual'
 *
 * Run: npx tsx scripts/fix-membership-level-and-dates.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

/**
 * Convert an Excel serial date number to YYYY-MM-DD.
 * Excel serial dates count days since 1900-01-01 (with the 1900 leap year bug).
 */
function excelSerialToDate(serial: number): string {
  // Excel epoch is 1900-01-01 = serial 1, but has a bug treating 1900 as a leap year
  // so we subtract 2 days (1 for the epoch offset, 1 for the leap year bug)
  const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
  const date = new Date(excelEpoch.getTime() + serial * 86400000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Try to parse a date value into YYYY-MM-DD format.
 * Handles: Excel serial numbers, ISO date strings, already YYYY-MM-DD strings.
 */
function parseDate(value: string): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  // Already proper YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Excel serial number (a numeric value, possibly with decimals)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    return excelSerialToDate(num);
  }

  // ISO date string — take the date part
  if (trimmed.includes('T')) {
    const datePart = trimmed.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }

  return null;
}

function parseMembershipLevel(lifeMember: string): string {
  const val = lifeMember.trim().toUpperCase();
  if (val.includes('FAMILY')) return 'Family';
  if (val.includes('INDIVIDUAL')) return 'Individual';
  if (val === 'YES') return 'Family';
  return '';
}

async function main() {
  console.log('Backfilling membershipLevel and registrationDate...\n');

  const rawRows = await prisma.rawMemberImport.findMany();
  const members = await prisma.member.findMany({
    include: { spouses: true },
  });

  // Build email -> raw import map (most recent per email)
  const rawByEmail = new Map<string, typeof rawRows[0]>();
  const sorted = [...rawRows].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  for (const row of sorted) {
    const email = row.email.toLowerCase().trim();
    if (email && !rawByEmail.has(email)) {
      rawByEmail.set(email, row);
    }
  }

  let updated = 0;
  let skipped = 0;
  let dateFixes = 0;
  let levelFixes = 0;

  for (const member of members) {
    const email = member.email.toLowerCase().trim();
    const raw = rawByEmail.get(email);
    const updates: Record<string, string> = {};

    // --- Fix registrationDate ---
    // First check if the current registrationDate is an Excel serial number
    const currentDate = member.registrationDate;
    if (currentDate) {
      const parsed = parseDate(currentDate);
      if (parsed && parsed !== currentDate) {
        updates.registrationDate = parsed;
        dateFixes++;
      }
    }
    // If no registrationDate at all, try raw.submittedAt
    if (!currentDate && raw?.submittedAt) {
      const parsed = parseDate(raw.submittedAt);
      if (parsed) {
        updates.registrationDate = parsed;
        dateFixes++;
      }
    }

    // --- Fix membershipLevel ---
    if (!member.membershipLevel) {
      // Try from raw import first
      let level = '';
      if (raw) {
        level = parseMembershipLevel(raw.lifeMember);
      }
      // Fallback: if still empty, use spouse presence
      if (!level) {
        const hasSpouse = member.spouses && member.spouses.length > 0 &&
          member.spouses.some((s: { firstName: string; email: string }) => s.firstName?.trim() || s.email?.trim());
        level = hasSpouse ? 'Family' : 'Individual';
      }
      if (level) {
        updates.membershipLevel = level;
        levelFixes++;
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    updates.updatedAt = new Date().toISOString();

    await prisma.member.update({
      where: { id: member.id },
      data: updates,
    });

    updated++;
    if (updated % 50 === 0) console.log(`  ...updated ${updated} members`);
  }

  console.log(`\nBackfill complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no changes needed): ${skipped}`);
  console.log(`  Registration dates fixed: ${dateFixes}`);
  console.log(`  Membership levels set: ${levelFixes}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
