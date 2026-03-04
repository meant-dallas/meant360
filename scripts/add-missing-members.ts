/**
 * Add members that don't have email addresses.
 * Run: npx tsx scripts/add-missing-members.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

const YEARS = ['2024', '2025', '2026', '2027', '2028', '2029'];

const members = [
  { firstName: 'George', middleName: '', lastName: 'Samuel', life: true, regDate: '2013-01-01' },
  { firstName: 'Late Dr. George', middleName: '', lastName: 'Sudharshan', life: true, regDate: '2013-01-01' },
  { firstName: 'Joy', middleName: 'Philip', lastName: 'Chinnamma', life: true, regDate: '2013-01-01' },
  { firstName: 'Laura', middleName: '', lastName: 'Mani', life: true, regDate: '2013-01-01' },
  { firstName: 'Ramya', middleName: 'Unnithan', lastName: 'Pramod Nair', life: true, regDate: '2013-01-01' },
  { firstName: 'Vaisakh', middleName: '', lastName: 'Nair', life: false, regDate: '' },
];

async function main() {
  const now = new Date().toISOString();

  for (const m of members) {
    const membershipType = m.life ? 'Life Member' : 'Yearly';
    const status = 'Active';

    const member = await prisma.member.create({
      data: {
        firstName: m.firstName,
        middleName: m.middleName,
        lastName: m.lastName,
        email: '',
        phone: '',
        homePhone: '',
        cellPhone: '',
        qualifyingDegree: '',
        nativePlace: '',
        college: '',
        jobTitle: '',
        employer: '',
        specialInterests: '',
        submissionId: '',
        membershipType,
        registrationDate: m.regDate || now.split('T')[0],
        status,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create membership year records
    if (m.life) {
      // Life members get Life Member status for all years
      for (const year of YEARS) {
        await prisma.memberMembership.create({
          data: { memberId: member.id, year, status: 'Life Member', createdAt: now, updatedAt: now },
        });
      }
    } else {
      // Active yearly member — current year only
      await prisma.memberMembership.create({
        data: { memberId: member.id, year: '2026', status: 'Active', createdAt: now, updatedAt: now },
      });
    }

    console.log(`Created: ${m.firstName} ${m.lastName} (${membershipType})`);
  }

  console.log(`\nDone — ${members.length} members added.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
