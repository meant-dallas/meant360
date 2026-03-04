/**
 * Reset all normalized member data and re-run migration from raw_member_imports.
 * WARNING: This deletes all member data!
 *
 * Run: ENV_FILE=.env.production.local npx tsx scripts/reset-and-remigrate.ts
 */
import { config } from 'dotenv';
const envFile = process.env.ENV_FILE || '.env.development.local';
console.log(`Loading env from: ${envFile}`);
config({ path: envFile });
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, { fullResults: true }) });

async function deleteAll(model: { findMany: () => Promise<{ id: string }[]> }, deleteOne: (id: string) => Promise<unknown>, label: string) {
  const rows = await model.findMany();
  for (const row of rows) {
    await deleteOne(row.id);
  }
  console.log(`  Deleted ${rows.length} ${label}`);
}

async function main() {
  console.log('Step 1: Deleting all normalized member data...\n');

  // Delete in dependency order (children before parents)
  await deleteAll(prisma.memberPayment, (id) => prisma.memberPayment.delete({ where: { id } }), 'payments');
  await deleteAll(prisma.memberSponsor, (id) => prisma.memberSponsor.delete({ where: { id } }), 'sponsors');
  await deleteAll(prisma.memberChild, (id) => prisma.memberChild.delete({ where: { id } }), 'children');
  await deleteAll(prisma.memberSpouse, (id) => prisma.memberSpouse.delete({ where: { id } }), 'spouses');
  await deleteAll(prisma.memberMembership, (id) => prisma.memberMembership.delete({ where: { id } }), 'memberships');
  await deleteAll(prisma.memberAddress, (id) => prisma.memberAddress.delete({ where: { id } }), 'addresses');
  await deleteAll(prisma.member, (id) => prisma.member.delete({ where: { id } }), 'members');

  console.log('\nStep 2: Resetting raw_member_imports migrated flag...\n');

  const rawRows = await prisma.rawMemberImport.findMany();
  for (const row of rawRows) {
    await prisma.rawMemberImport.update({
      where: { id: row.id },
      data: { migrated: '' },
    });
  }
  console.log(`  Reset ${rawRows.length} raw rows`);

  console.log('\nDone! Now run:');
  console.log(`  ENV_FILE=${envFile} npx tsx scripts/migrate-staging-to-normalized.ts`);
  console.log(`  ENV_FILE=${envFile} npx tsx scripts/fix-membership-level-and-dates.ts`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
