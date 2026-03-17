/**
 * Seed default chart of accounts and categories for the financial subsystem.
 *
 * Run: npx tsx scripts/seed-fin-accounts.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash - Bank', type: 'asset' },
  { code: '1010', name: 'Cash - Square', type: 'asset' },
  { code: '1020', name: 'Cash - PayPal', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '3000', name: 'Reserve Fund', type: 'equity' },
  { code: '4000', name: 'Membership Income', type: 'income' },
  { code: '4001', name: 'Life Membership Income', type: 'income' },
  { code: '4010', name: 'Event Income', type: 'income' },
  { code: '4020', name: 'Sponsorship Income', type: 'income' },
  { code: '4030', name: 'Donation Income', type: 'income' },
  { code: '5000', name: 'Venue Expense', type: 'expense' },
  { code: '5001', name: 'Food Expense', type: 'expense' },
  { code: '5002', name: 'Decorations Expense', type: 'expense' },
  { code: '5003', name: 'Printing Expense', type: 'expense' },
  { code: '5004', name: 'Technology Expense', type: 'expense' },
  { code: '5010', name: 'Processing Fees', type: 'expense' },
  { code: '5020', name: 'Refunds', type: 'expense' },
];

const DEFAULT_CATEGORIES = [
  { name: 'Membership', type: 'income' },
  { name: 'Life Membership', type: 'income' },
  { name: 'Event Income', type: 'income' },
  { name: 'Sponsorship', type: 'income' },
  { name: 'Donation', type: 'income' },
  { name: 'Venue', type: 'expense' },
  { name: 'Food', type: 'expense' },
  { name: 'Decorations', type: 'expense' },
  { name: 'Printing', type: 'expense' },
  { name: 'Technology', type: 'expense' },
  { name: 'Processing Fees', type: 'expense' },
  { name: 'Refunds', type: 'expense' },
];

async function main() {
  console.log('Seeding financial accounts and categories...\n');

  // Seed accounts (upsert by code)
  let created = 0;
  let skipped = 0;
  for (const acct of DEFAULT_ACCOUNTS) {
    const existing = await prisma.finAccount.findUnique({ where: { code: acct.code } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.finAccount.create({ data: acct });
    created++;
    console.log(`  + Account ${acct.code}: ${acct.name}`);
  }
  console.log(`\nAccounts: ${created} created, ${skipped} already existed.`);

  // Seed categories (check by name + type)
  created = 0;
  skipped = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.finCategory.findFirst({
      where: { name: cat.name, type: cat.type },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.finCategory.create({ data: cat });
    created++;
    console.log(`  + Category: ${cat.name} (${cat.type})`);
  }
  console.log(`\nCategories: ${created} created, ${skipped} already existed.`);

  console.log('\nDone!');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
