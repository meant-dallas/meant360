/**
 * Seed default categories for the financial subsystem.
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

const DEFAULT_ACCOUNTS = [
  { name: 'Checking Account', openingBalance: 0, sortOrder: 0 },
  { name: 'Savings Account', openingBalance: 0, sortOrder: 1 },
  { name: 'CD (Reserve)', openingBalance: 0, sortOrder: 2 },
];

async function main() {
  console.log('Seeding financial categories and accounts...\n');

  // Seed categories (check by name + type)
  let created = 0;
  let skipped = 0;
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

  // Seed simple accounts
  created = 0;
  skipped = 0;
  for (const acct of DEFAULT_ACCOUNTS) {
    const existing = await prisma.finSimpleAccount.findFirst({
      where: { name: acct.name },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.finSimpleAccount.create({ data: acct });
    created++;
    console.log(`  + Account: ${acct.name}`);
  }
  console.log(`\nAccounts: ${created} created, ${skipped} already existed.`);

  console.log('\nDone!');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
