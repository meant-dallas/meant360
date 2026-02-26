import { google, sheets_v4 } from 'googleapis';
import { SHEET_TABS } from '@/types';
import { sanitizeRecord } from './security';

// ========================================
// Google Sheets Database Layer
// ========================================

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets(): sheets_v4.Sheets {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  return id;
}

// --- Schema Definitions ---
// Each tab's column headers in order

export const SHEET_SCHEMAS: Record<string, string[]> = {
  [SHEET_TABS.INCOME]: [
    'id', 'incomeType', 'eventName', 'amount', 'date',
    'paymentMethod', 'payerName', 'notes', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.SPONSORSHIP]: [
    'id', 'sponsorName', 'year', 'sponsorEmail', 'sponsorPhone',
    'type', 'amount', 'eventName',
    'paymentMethod', 'paymentDate', 'status', 'notes', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.SPONSORS]: [
    'id', 'name', 'email', 'phone', 'notes', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.EXPENSES]: [
    'id', 'expenseType', 'eventName', 'category', 'description',
    'amount', 'date', 'paidBy', 'receiptUrl', 'receiptFileId',
    'notes', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.REIMBURSEMENTS]: [
    'id', 'expenseId', 'requestedBy', 'amount', 'description',
    'eventName', 'category', 'receiptUrl', 'receiptFileId', 'status',
    'approvedBy', 'approvedDate', 'reimbursedDate', 'notes', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.TRANSACTIONS]: [
    'id', 'externalId', 'source', 'amount', 'fee', 'netAmount',
    'description', 'payerName', 'payerEmail', 'date', 'tag',
    'eventName', 'syncedAt', 'notes',
  ],
  [SHEET_TABS.EVENTS]: [
    'id', 'name', 'date', 'description', 'status', 'createdAt',
    'parentEventId', 'pricingRules',
  ],
  [SHEET_TABS.MEMBERS]: [
    'id', 'name', 'address', 'email', 'phone',
    'spouseName', 'spouseEmail', 'spousePhone', 'children',
    'membershipType', 'membershipYears', 'registrationDate', 'renewalDate',
    'status', 'notes', 'createdAt', 'updatedAt', 'loginEmail',
  ],
  [SHEET_TABS.GUESTS]: [
    'id', 'name', 'email', 'phone', 'city', 'referredBy',
    'eventsAttended', 'lastEventDate', 'createdAt', 'updatedAt',
  ],
  [SHEET_TABS.EVENT_REGISTRATIONS]: [
    'id', 'eventId', 'type', 'memberId', 'guestId',
    'name', 'email', 'phone', 'adults', 'kids', 'registeredAt',
    'totalPrice', 'priceBreakdown',
    'paymentStatus', 'paymentMethod', 'transactionId',
  ],
  [SHEET_TABS.EVENT_CHECKINS]: [
    'id', 'eventId', 'type', 'memberId', 'guestId',
    'name', 'email', 'phone', 'adults', 'kids', 'checkedInAt',
    'totalPrice', 'priceBreakdown',
    'paymentStatus', 'paymentMethod', 'transactionId',
  ],
  [SHEET_TABS.ADMINS]: [
    'email', 'addedAt', 'addedBy', 'notes',
  ],
  [SHEET_TABS.SETTINGS]: [
    'key', 'value', 'updatedAt', 'updatedBy',
  ],
};

// --- Core CRUD Operations ---

export async function getRows(sheetName: string): Promise<Record<string, string>[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || '';
    });
    return record;
  });
}

export async function getRowById(
  sheetName: string,
  id: string,
): Promise<{ record: Record<string, string>; rowIndex: number } | null> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) return null;

  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = rows[i][index] || '';
      });
      return { record, rowIndex: i + 1 }; // 1-indexed for Sheets API
    }
  }
  return null;
}

export async function appendRow(
  sheetName: string,
  data: Record<string, string | number>,
): Promise<void> {
  const sheets = getSheets();
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) throw new Error(`Unknown sheet: ${sheetName}`);

  const sanitized = sanitizeRecord(data);
  const row = schema.map((col) => String(sanitized[col] ?? ''));

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });
}

export async function updateRow(
  sheetName: string,
  rowIndex: number,
  data: Record<string, string | number>,
): Promise<void> {
  const sheets = getSheets();
  const schema = SHEET_SCHEMAS[sheetName];
  if (!schema) throw new Error(`Unknown sheet: ${sheetName}`);

  const sanitized = sanitizeRecord(data);
  const row = schema.map((col) => String(sanitized[col] ?? ''));

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A${rowIndex}:${String.fromCharCode(64 + schema.length)}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });
}

export async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  const sheets = getSheets();

  // Get the sheet's gid (sheetId)
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
  });

  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );

  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1, // 0-indexed
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}

// --- Filtered Queries ---

export async function getRowsByDateRange(
  sheetName: string,
  dateField: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, string>[]> {
  const rows = await getRows(sheetName);
  return rows.filter((row) => {
    const d = row[dateField];
    return d >= startDate && d <= endDate;
  });
}

export async function getRowsByField(
  sheetName: string,
  field: string,
  value: string,
): Promise<Record<string, string>[]> {
  const rows = await getRows(sheetName);
  return rows.filter((row) => row[field] === value);
}

// --- Settings Helpers ---

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await getRows(SHEET_TABS.SETTINGS);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.key) settings[row.key] = row.value || '';
  }
  return settings;
}

export async function upsertSetting(key: string, value: string, updatedBy: string): Promise<void> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEET_TABS.SETTINGS}!A:Z`,
  });

  const rows = response.data.values;
  const now = new Date().toISOString();

  if (rows && rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId: getSpreadsheetId(),
          range: `${SHEET_TABS.SETTINGS}!A${i + 1}:D${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[key, value, now, updatedBy]] },
        });
        return;
      }
    }
  }

  // Append new row
  await appendRow(SHEET_TABS.SETTINGS, { key, value, updatedAt: now, updatedBy });
}

// --- Setup: Create all tabs with headers ---

export async function setupSpreadsheet(): Promise<void> {
  const sheets = getSheets();

  // Get existing sheets
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
  });

  const existingSheets =
    spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  // Create missing sheets
  const requests: sheets_v4.Schema$Request[] = [];

  for (const tabName of Object.keys(SHEET_SCHEMAS)) {
    if (!existingSheets.includes(tabName)) {
      requests.push({
        addSheet: {
          properties: { title: tabName },
        },
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { requests },
    });
  }

  // Always overwrite headers to ensure new columns are added
  for (const [tabName, headers] of Object.entries(SHEET_SCHEMAS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSpreadsheetId(),
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }
}
