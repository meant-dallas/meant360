/**
 * One-off: add the expense FinCategory rows needed so every option in the
 * Expenses page's category dropdown (src/app/(admin)/finance/expenses/page.tsx
 * EXPENSE_CATEGORIES) resolves to a real category once expense CRUD is
 * repointed at FinRawTransaction. Venue/Admin/Catering are deliberately
 * hand-mapped onto existing categories (Venue Rental, Admin - Tech, Food
 * Expenses) elsewhere instead of getting new rows here.
 *
 * Idempotent: checks by code first, then name, creates only if missing.
 *
 * Run: npx tsx scripts/add-missing-expense-categories.ts
 */
import { config } from 'dotenv';
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

const CATEGORIES_TO_ADD = [
  { name: 'Supplies', type: 'expense', code: 'supplies' },
  { name: 'Miscellaneous', type: 'expense', code: 'misc' },
  { name: 'Decorations', type: 'expense', code: 'decorations' },
  { name: 'Sound & Lighting', type: 'expense', code: 'sound_lighting' },
  { name: 'Transportation', type: 'expense', code: 'transportation' },
  { name: 'Marketing', type: 'expense', code: 'marketing' },
  { name: 'Insurance', type: 'expense', code: 'insurance' },
];

async function main() {
  for (const cat of CATEGORIES_TO_ADD) {
    const existing = await prisma.finCategory.findFirst({
      where: { OR: [{ code: cat.code }, { name: cat.name, type: cat.type }] },
    });
    if (existing) {
      console.log(`  = Already exists: ${cat.name} (${cat.type}, code=${existing.code ?? 'null'})`);
      continue;
    }
    const created = await prisma.finCategory.create({ data: cat });
    console.log(`  + Created: ${created.name} (${created.type}, code=${created.code}, id=${created.id})`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
