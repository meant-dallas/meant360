/**
 * Import Excel membership data into the raw_member_imports staging table.
 * Run: npx tsx scripts/import-excel-members.ts <path-to-excel-file>
 */
import { config } from 'dotenv';
// Load env files in priority order (same as Next.js)
config({ path: '.env.development.local' });
config({ path: '.env.local' });
config({ path: '.env' });

import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error('DATABASE_URL not found. Check your .env.development.local or .env.local');
  process.exit(1);
}

const adapter = new PrismaNeonHttp(connectionString, { fullResults: true });
const prisma = new PrismaClient({ adapter });

// Map Excel column headers (exact names from the actual spreadsheet) to RawMemberImport fields.
const COLUMN_MAP: Record<string, string> = {
  // Submission metadata
  'Submission ID': 'submissionId',
  'Submission Date': 'submittedAt',
  // Member info
  'First Name': 'firstName',
  'Middle Name': 'middleName',
  'Last Name': 'lastName',
  'E-mail': 'email',
  'Primary Number': 'homePhone',
  'Home Number': 'homePhone',
  'Cellular Number': 'cellPhone',
  'Qualifying Degree': 'qualifyingDegree',
  'Native Place': 'nativePlace',
  'College of graduation': 'college',
  'Your Job Title': 'jobTitle',
  'Employer': 'employer',
  'Special Interests': 'specialInterests',
  // Address
  'Street Address': 'street',
  'Street Address Line 2': 'street2',
  'City': 'city',
  'State': 'state',
  'Zip Code': 'zipCode',
  'Country': 'country',
  // Spouse
  'Spouse Name (First Name)': 'spouseFirstName',
  'Spouse Name (Middle Name)': 'spouseMiddleName',
  'Spouse Name (Last Name)': 'spouseLastName',
  'Spouse Email': 'spouseEmail',
  'Spouse Primary Number': 'spousePhone',
  'Spouse Native Place': 'spouseNativePlace',
  'Spouse Company': 'spouseCompany',
  'Spouse College of Graduation': 'spouseCollege',
  'Spouse Qualifying Degree': 'spouseQualifyingDegree',
  // Children (slot 1)
  'Child Name1': 'child1Name',
  'Sex(M/F)': 'child1Sex',
  'Grade': 'child1Grade',
  'Age': 'child1Age',
  'Date of Birth': 'child1Dob',
  // Children (slot 2)
  'Child Name2': 'child2Name',
  'Sex(M/F) 2': 'child2Sex',
  'Grade 2': 'child2Grade',
  'Age 2': 'child2Age',
  'Date of Birth 2': 'child2Dob',
  // Children (slot 3)
  'Child Name3': 'child3Name',
  'Sex(M/F) 3': 'child3Sex',
  'Grade 3': 'child3Grade',
  'Age 3': 'child3Age',
  'Date of Birth 3': 'child3Dob',
  // Children (slot 4 — two possible column variants)
  'Child Name4': 'child4Name',
  'Child Name4_1': 'child4Name',
  'Sex(M/F) 4': 'child4Sex',
  'Sex(M/F) 4_1': 'child4Sex',
  'Grade 4': 'child4Grade',
  'Grade 4_1': 'child4Grade',
  'Age 4': 'child4Age',
  'Age 4_1': 'child4Age',
  'Date of Birth 5': 'child4Dob',
  'Date of Birth 4': 'child4Dob',
  // Membership
  'Membership Type': 'lifeMember',
  ' LIFE Member': 'lifeMember',
  'Requested Membership Level': 'lifeMember',
  '2024 Membership Status': 'status2024',
  ' 2025 Membership Status 2': 'status2025',
  '2026 Membership Status 3': 'status2026',
  '2027 Membership Status 4': 'status2027',
  '2028 Membership Status 5': 'status2028',
  '2029 Membership Status 6': 'status2029',
  // Sponsor
  'Sponsoring Member Name': 'sponsorName',
  'Sponsoring Member Email': 'sponsorEmail',
  'Sponsoring Member Phone Number': 'sponsorPhone',
  // Payment
  'Paypal Payment Options: Products': 'paypalPaymentInfo',
  'Paypal Payment Options: Payer Info': 'extra1',
  'Paypal Payment Options: Payer Address': 'extra2',
};

// Fields that are valid on RawMemberImport model
const VALID_FIELDS = new Set([
  'submissionId', 'respondentId', 'submittedAt', 'lastModifiedAt', 'startedAt',
  'firstName', 'middleName', 'lastName', 'email', 'homePhone', 'cellPhone',
  'qualifyingDegree', 'nativePlace', 'college', 'employer', 'jobTitle', 'specialInterests',
  'street', 'street2', 'city', 'state', 'zipCode', 'country',
  'spouseFirstName', 'spouseMiddleName', 'spouseLastName', 'spouseEmail', 'spousePhone',
  'spouseNativePlace', 'spouseCompany', 'spouseCollege', 'spouseQualifyingDegree',
  'child1Name', 'child1Sex', 'child1Grade', 'child1Age', 'child1Dob',
  'child2Name', 'child2Sex', 'child2Grade', 'child2Age', 'child2Dob',
  'child3Name', 'child3Sex', 'child3Grade', 'child3Age', 'child3Dob',
  'child4Name', 'child4Sex', 'child4Grade', 'child4Age', 'child4Dob',
  'lifeMember', 'status2024', 'status2025', 'status2026', 'status2027', 'status2028', 'status2029',
  'sponsorName', 'sponsorEmail', 'sponsorPhone',
  'paypalPaymentInfo',
  'extra1', 'extra2', 'extra3', 'extra4', 'extra5', 'extra6', 'extra7', 'extra8', 'extra9', 'extra10',
  'extra11', 'extra12', 'extra13', 'extra14', 'extra15', 'extra16', 'extra17', 'extra18', 'extra19', 'extra20',
  'migrated', 'createdAt', 'updatedAt',
]);

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-excel-members.ts <path-to-excel-file>');
    process.exit(1);
  }

  console.log(`Reading Excel file: ${filePath}`);
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames[0];
  console.log(`Using sheet: ${sheetName}`);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  console.log(`Found ${rows.length} rows`);

  if (rows.length === 0) {
    console.log('No data to import');
    return;
  }

  // Map column headers
  const headers = Object.keys(rows[0]);
  console.log(`\nExcel columns (${headers.length}):`);

  const mapped: string[] = [];
  const unmapped: string[] = [];
  for (const h of headers) {
    if (COLUMN_MAP[h]) {
      mapped.push(`  "${h}" -> ${COLUMN_MAP[h]}`);
    } else {
      unmapped.push(h);
    }
  }
  console.log(`\nMapped columns (${mapped.length}):`);
  mapped.forEach(m => console.log(m));

  if (unmapped.length > 0) {
    console.log(`\nUnmapped columns (${unmapped.length}): ${unmapped.join(', ')}`);
    console.log('These will be stored in extra fields');
  }

  const now = new Date().toISOString();
  let imported = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const record: Record<string, string> = {
        createdAt: now,
        updatedAt: now,
      };

      // Map known columns
      for (const [header, value] of Object.entries(row)) {
        const field = COLUMN_MAP[header];
        if (field && VALID_FIELDS.has(field)) {
          // Don't overwrite if already set (first match wins)
          if (!record[field]) {
            record[field] = safeStr(value);
          }
        }
      }

      // Map remaining unmapped columns to extra fields
      let extraIdx = 3; // extra1 and extra2 are used by PayPal payer info/address
      for (const header of unmapped) {
        if (extraIdx > 20) break;
        const val = safeStr(row[header]);
        if (val) {
          record[`extra${extraIdx}`] = val;
          extraIdx++;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.rawMemberImport.create({ data: record as any });
      imported++;
      if (imported % 50 === 0) console.log(`  ...imported ${imported} rows`);
    } catch (err) {
      errors++;
      if (errors <= 3) {
        console.error(`Error on row ${imported + errors}:`, err);
      } else if (errors === 4) {
        console.error('(suppressing further error details...)');
      }
    }
  }

  console.log(`\nImport complete: ${imported} rows imported, ${errors} errors`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
