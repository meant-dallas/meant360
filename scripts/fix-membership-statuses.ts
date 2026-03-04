/**
 * Fix membership types, statuses, and per-year records based on corrected rules.
 *
 * Rules:
 * - Life Member if lifeMember='YES' OR any status column contains 'LIFE'
 * - Life Members are always Active and get 'Life Member' status for ALL years
 * - Yearly members: overall status based on current year (2026)
 *   - If 2026 has ACTIVE/CURRENT → 'Active'
 *   - Otherwise → 'Not Renewed'
 * - Per-year membership: only create records for years where status is non-empty and not 'NO'/'N/A'
 *
 * Run: npx tsx scripts/fix-membership-statuses.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

const CURRENT_YEAR = '2026';

function normalizeYearStatus(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s === 'N/A' || s === 'NO' || s === 'NONE' || s === '-') return null;
  if (s.includes('LIFE')) return 'Life Member';
  if (s === 'ACTIVE' || s.startsWith('ACTIVE') || s === 'CURRENT' || s.startsWith('CURRENT') || s === 'YES' || s === 'RENEWED') return 'Active';
  // Unknown non-empty value — treat as Active
  return 'Active';
}

function isLifeMember(raw: {
  lifeMember: string;
  status2024: string;
  status2025: string;
  status2026: string;
  status2027: string;
  status2028: string;
  status2029: string;
}): boolean {
  if (raw.lifeMember.trim().toUpperCase() === 'YES') return true;
  return [raw.status2024, raw.status2025, raw.status2026, raw.status2027, raw.status2028, raw.status2029]
    .some(s => s.toUpperCase().includes('LIFE'));
}

async function main() {
  console.log('Fixing membership statuses...\n');

  // Fetch all raw imports and all members
  const rawRows = await prisma.rawMemberImport.findMany();
  const members = await prisma.member.findMany();

  // Build email -> raw import map (most recent per email, matching dedup logic)
  const rawByEmail = new Map<string, typeof rawRows[0]>();
  // Sort by submittedAt desc so first match is most recent
  const sorted = [...rawRows].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  for (const row of sorted) {
    const email = row.email.toLowerCase().trim();
    if (email && !rawByEmail.has(email)) {
      rawByEmail.set(email, row);
    }
  }

  let updated = 0;
  let skipped = 0;
  let lifeMemberCount = 0;
  let activeCount = 0;
  let notRenewedCount = 0;

  for (const member of members) {
    const email = member.email.toLowerCase().trim();
    const raw = rawByEmail.get(email);
    if (!raw) {
      skipped++;
      continue;
    }

    const life = isLifeMember(raw);
    const membershipType = life ? 'Life Member' : 'Yearly';

    // Compute per-year statuses
    const yearFields = [
      { year: '2024', value: raw.status2024 },
      { year: '2025', value: raw.status2025 },
      { year: '2026', value: raw.status2026 },
      { year: '2027', value: raw.status2027 },
      { year: '2028', value: raw.status2028 },
      { year: '2029', value: raw.status2029 },
    ];

    const yearStatuses: { year: string; status: string }[] = [];
    if (life) {
      // Life members get Life Member status for ALL years 2024-2029
      for (const { year } of yearFields) {
        yearStatuses.push({ year, status: 'Life Member' });
      }
    } else {
      for (const { year, value } of yearFields) {
        const normalized = normalizeYearStatus(value);
        if (normalized) {
          yearStatuses.push({ year, status: normalized });
        }
      }
    }

    // Compute overall status
    let overallStatus: string;
    if (life) {
      overallStatus = 'Active';
      lifeMemberCount++;
    } else {
      // Check current year status
      const currentYearEntry = yearStatuses.find(ys => ys.year === CURRENT_YEAR);
      if (currentYearEntry) {
        overallStatus = 'Active';
        activeCount++;
      } else {
        overallStatus = 'Not Renewed';
        notRenewedCount++;
      }
    }

    // Update member record
    await prisma.member.update({
      where: { id: member.id },
      data: {
        membershipType,
        status: overallStatus,
        updatedAt: new Date().toISOString(),
      },
    });

    // Delete existing membership year records and recreate
    const existing = await prisma.memberMembership.findMany({ where: { memberId: member.id } });
    for (const e of existing) {
      await prisma.memberMembership.delete({ where: { id: e.id } });
    }

    const now = new Date().toISOString();
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

    updated++;
    if (updated % 50 === 0) console.log(`  ...updated ${updated} members`);
  }

  console.log(`\nFix complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no raw match): ${skipped}`);
  console.log(`  Life Members: ${lifeMemberCount}`);
  console.log(`  Active (renewed ${CURRENT_YEAR}): ${activeCount}`);
  console.log(`  Not Renewed: ${notRenewedCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
