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

// `code` is the stable key application code resolves categories by — never
// resolve a category by its display `name`, which committee members can
// rename freely from the Categories admin page.
const DEFAULT_CATEGORIES = [
  { name: 'Membership', type: 'income', code: 'membership' },
  { name: 'Life Membership', type: 'income', code: 'life_membership' },
  { name: 'Event Income', type: 'income', code: 'event_income' },
  { name: 'Sponsorship', type: 'income', code: 'sponsorship' },
  { name: 'Donation', type: 'income', code: 'donation' },
  { name: 'Venue', type: 'expense', code: 'venue' },
  { name: 'Food', type: 'expense', code: 'food' },
  { name: 'Decorations', type: 'expense', code: 'decorations' },
  { name: 'Printing', type: 'expense', code: 'printing' },
  { name: 'Technology', type: 'expense', code: 'technology' },
  { name: 'Processing Fees', type: 'expense', code: 'processing_fees' },
  { name: 'Refunds', type: 'expense', code: 'refunds' },
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
      if (!existing.code) {
        await prisma.finCategory.update({ where: { id: existing.id }, data: { code: cat.code } });
        console.log(`  ~ Backfilled code for: ${cat.name} (${cat.type})`);
      }
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
