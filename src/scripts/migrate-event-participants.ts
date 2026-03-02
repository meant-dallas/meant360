/**
 * Migration script: EventRegistrations + EventCheckins → EventParticipants
 *
 * Usage: npx tsx src/scripts/migrate-event-participants.ts
 *
 * This script:
 * 1. Reads all rows from EventRegistrations → creates EventParticipants rows
 *    with registeredAdults/Kids/At filled, actual* empty
 * 2. Reads all rows from EventCheckins → if matching registration exists
 *    (same eventId + email), updates that row's actual* and checkedInAt;
 *    otherwise creates a walk-in row
 * 3. Is idempotent: checks if EventParticipants already has data before running
 */

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function parseSheet(values: string[][] | null | undefined): Record<string, string>[] {
  if (!values || values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => { record[header] = row[i] || ''; });
    return record;
  });
}

const PARTICIPANT_HEADERS = [
  'id', 'eventId', 'type', 'memberId', 'guestId',
  'name', 'email', 'phone',
  'registeredAdults', 'registeredKids', 'registeredAt',
  'actualAdults', 'actualKids', 'checkedInAt',
  'selectedActivities', 'customFields',
  'totalPrice', 'priceBreakdown',
  'paymentStatus', 'paymentMethod', 'transactionId',
];

async function migrate() {
  const sheets = getSheets();

  // Check if EventParticipants tab already has data
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'EventParticipants!A:A',
    });
    const rows = existing.data.values || [];
    if (rows.length > 1) {
      console.log(`EventParticipants already has ${rows.length - 1} data rows. Skipping migration.`);
      return;
    }
  } catch {
    console.log('EventParticipants tab does not exist yet; will create it.');
  }

  // Ensure the tab exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTabs = spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  if (!existingTabs.includes('EventParticipants')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'EventParticipants' } } }],
      },
    });
    console.log('Created EventParticipants tab.');
  }

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'EventParticipants!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [PARTICIPANT_HEADERS] },
  });

  // Read registrations
  let registrations: Record<string, string>[] = [];
  try {
    const regRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'EventRegistrations!A:Z',
    });
    registrations = parseSheet(regRes.data.values);
  } catch {
    console.log('No EventRegistrations tab found.');
  }

  // Read check-ins
  let checkins: Record<string, string>[] = [];
  try {
    const ciRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'EventCheckins!A:Z',
    });
    checkins = parseSheet(ciRes.data.values);
  } catch {
    console.log('No EventCheckins tab found.');
  }

  // Build participant rows from registrations
  const participantRows: string[][] = [];
  // Track registrations by eventId+email for matching check-ins
  const regMap = new Map<string, number>(); // key → index in participantRows

  for (const reg of registrations) {
    const key = `${reg.eventId}|${(reg.email || '').toLowerCase().trim()}`;
    const row = PARTICIPANT_HEADERS.map((h) => {
      switch (h) {
        case 'registeredAdults': return reg.adults || '0';
        case 'registeredKids': return reg.kids || '0';
        case 'registeredAt': return reg.registeredAt || '';
        case 'actualAdults': return '';
        case 'actualKids': return '';
        case 'checkedInAt': return '';
        case 'selectedActivities': return '';
        case 'customFields': return '';
        default: return reg[h] || '';
      }
    });
    regMap.set(key, participantRows.length);
    participantRows.push(row);
  }

  // Process check-ins
  let generateId = 0;
  for (const ci of checkins) {
    const key = `${ci.eventId}|${(ci.email || '').toLowerCase().trim()}`;
    const regIdx = regMap.get(key);

    if (regIdx !== undefined) {
      // Update existing registration row with check-in data
      const headerIdx = (h: string) => PARTICIPANT_HEADERS.indexOf(h);
      participantRows[regIdx][headerIdx('actualAdults')] = ci.adults || '0';
      participantRows[regIdx][headerIdx('actualKids')] = ci.kids || '0';
      participantRows[regIdx][headerIdx('checkedInAt')] = ci.checkedInAt || '';
      // If check-in has payment but registration doesn't, use check-in payment
      if (ci.paymentStatus && !participantRows[regIdx][headerIdx('paymentStatus')]) {
        participantRows[regIdx][headerIdx('totalPrice')] = ci.totalPrice || '0';
        participantRows[regIdx][headerIdx('priceBreakdown')] = ci.priceBreakdown || '';
        participantRows[regIdx][headerIdx('paymentStatus')] = ci.paymentStatus || '';
        participantRows[regIdx][headerIdx('paymentMethod')] = ci.paymentMethod || '';
        participantRows[regIdx][headerIdx('transactionId')] = ci.transactionId || '';
      }
    } else {
      // Walk-in: no prior registration
      const row = PARTICIPANT_HEADERS.map((h) => {
        switch (h) {
          case 'id': return ci.id || `walkin_${++generateId}`;
          case 'registeredAdults': return '';
          case 'registeredKids': return '';
          case 'registeredAt': return '';
          case 'actualAdults': return ci.adults || '0';
          case 'actualKids': return ci.kids || '0';
          case 'checkedInAt': return ci.checkedInAt || '';
          case 'selectedActivities': return '';
          case 'customFields': return '';
          default: return ci[h] || '';
        }
      });
      participantRows.push(row);
    }
  }

  if (participantRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'EventParticipants!A:A',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: participantRows },
    });
    console.log(`Migrated ${participantRows.length} participant rows.`);
  } else {
    console.log('No data to migrate.');
  }

  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
