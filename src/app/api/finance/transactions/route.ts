import { NextRequest, NextResponse } from 'next/server';
import { getRows, appendRow, getRowById, updateRow } from '@/lib/google-sheets';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { SHEET_TABS } from '@/types';
import { fetchSquareTransactions } from '@/lib/square';
import { fetchPayPalTransactions } from '@/lib/paypal';
import { transactionSyncSchema, transactionUpdateSchema } from '@/types/schemas';

const SHEET = SHEET_TABS.TRANSACTIONS;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (view === 'all') {
      return await getUnifiedLedger(startDate, endDate, searchParams.get('type'));
    }

    // Legacy behavior: only synced transactions
    const source = searchParams.get('source');
    const tag = searchParams.get('tag');

    let rows = await getRows(SHEET);

    if (source) rows = rows.filter((r) => r.source === source);
    if (tag) rows = rows.filter((r) => r.tag === tag);
    if (startDate) rows = rows.filter((r) => r.date >= startDate);
    if (endDate) rows = rows.filter((r) => r.date <= endDate);

    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/transactions error:', error);
    return errorResponse('Failed to fetch transactions', 500);
  }
}

async function getUnifiedLedger(
  startDate: string | null,
  endDate: string | null,
  typeFilter: string | null,
) {
  // Fetch all sources in parallel
  const [income, expenses, reimbursements, syncedTxns, registrations, checkins, events] =
    await Promise.all([
      getRows(SHEET_TABS.INCOME),
      getRows(SHEET_TABS.EXPENSES),
      getRows(SHEET_TABS.REIMBURSEMENTS),
      getRows(SHEET),
      getRows(SHEET_TABS.EVENT_REGISTRATIONS),
      getRows(SHEET_TABS.EVENT_CHECKINS),
      getRows(SHEET_TABS.EVENTS),
    ]);

  // Build event ID → name lookup
  const eventNameMap = new Map<string, string>();
  for (const evt of events) {
    eventNameMap.set(evt.id, evt.name);
  }

  type UnifiedRow = {
    id: string;
    date: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    payerPayee: string;
    eventName: string;
    source: string;
    paymentMethod: string;
    status?: string;
  };

  const unified: UnifiedRow[] = [];

  // Manual income → type "Income", positive amount
  for (const r of income) {
    unified.push({
      id: r.id,
      date: r.date || '',
      type: 'Income',
      category: r.incomeType || '',
      description: r.notes || r.incomeType || '',
      amount: parseFloat(r.amount || '0'),
      payerPayee: r.payerName || '',
      eventName: r.eventName || '',
      source: 'Income Sheet',
      paymentMethod: r.paymentMethod || '',
    });
  }

  // Event registrations with totalPrice > 0 → type "Income"
  for (const r of registrations) {
    const price = parseFloat(r.totalPrice || '0');
    if (price <= 0) continue;
    unified.push({
      id: `reg_${r.id}`,
      date: r.registeredAt ? r.registeredAt.split('T')[0] : '',
      type: 'Income',
      category: 'Event Entry',
      description: r.priceBreakdown || 'Event Registration',
      amount: price,
      payerPayee: r.name || '',
      eventName: eventNameMap.get(r.eventId) || r.eventId,
      source: 'Registration',
      paymentMethod: r.paymentMethod || '',
    });
  }

  // Event checkins with totalPrice > 0 → type "Income"
  for (const r of checkins) {
    const price = parseFloat(r.totalPrice || '0');
    if (price <= 0) continue;
    unified.push({
      id: `chk_${r.id}`,
      date: r.checkedInAt ? r.checkedInAt.split('T')[0] : '',
      type: 'Income',
      category: 'Event Entry',
      description: r.priceBreakdown || 'Event Check-in',
      amount: price,
      payerPayee: r.name || '',
      eventName: eventNameMap.get(r.eventId) || r.eventId,
      source: 'Check-in',
      paymentMethod: r.paymentMethod || '',
    });
  }

  // Expenses → type "Expense", negative amount
  for (const r of expenses) {
    unified.push({
      id: r.id,
      date: r.date || '',
      type: 'Expense',
      category: r.category || '',
      description: r.description || '',
      amount: -Math.abs(parseFloat(r.amount || '0')),
      payerPayee: r.paidBy || '',
      eventName: r.eventName || '',
      source: 'Expense Sheet',
      paymentMethod: '',
    });
  }

  // Reimbursements → type "Reimbursement", show status
  for (const r of reimbursements) {
    unified.push({
      id: r.id,
      date: r.createdAt ? r.createdAt.split('T')[0] : '',
      type: 'Reimbursement',
      category: r.category || '',
      description: r.description || '',
      amount: -Math.abs(parseFloat(r.amount || '0')),
      payerPayee: r.requestedBy || '',
      eventName: r.eventName || '',
      source: 'Reimbursement Sheet',
      paymentMethod: '',
      status: r.status || 'Pending',
    });
  }

  // Synced transactions → type "Payment Sync"
  for (const r of syncedTxns) {
    unified.push({
      id: r.id,
      date: r.date || '',
      type: 'Payment Sync',
      category: r.tag || 'Untagged',
      description: r.description || '',
      amount: parseFloat(r.amount || '0'),
      payerPayee: r.payerName || '',
      eventName: r.eventName || '',
      source: r.source || '',
      paymentMethod: r.source || '',
    });
  }

  // Apply filters
  let filtered = unified;
  if (typeFilter) filtered = filtered.filter((r) => r.type === typeFilter);
  if (startDate) filtered = filtered.filter((r) => r.date >= startDate);
  if (endDate) filtered = filtered.filter((r) => r.date <= endDate);

  // Sort by date descending
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return jsonResponse(filtered);
}

// PUT to update a transaction's tag
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(transactionUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await getRowById(SHEET, validated.id);
    if (!existing) return errorResponse('Record not found', 404);

    const updated = { ...existing.record, ...validated } as Record<string, string>;
    await updateRow(SHEET, existing.rowIndex, updated);
    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/transactions error:', error);
    return errorResponse('Failed to update transaction', 500);
  }
}

// POST to sync transactions from Square/PayPal
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(transactionSyncSchema, body);
    if (validated instanceof NextResponse) return validated;

    const { source, startDate, endDate } = validated;

    // Fetch transactions from source
    let newTransactions;
    if (source === 'Square') {
      newTransactions = await fetchSquareTransactions(startDate, endDate);
    } else {
      newTransactions = await fetchPayPalTransactions(startDate, endDate);
    }

    // Deduplicate against existing records
    const existingRows = await getRows(SHEET);
    const existingExternalIds = new Set(existingRows.map((r) => r.externalId));

    let imported = 0;
    let skipped = 0;

    for (const txn of newTransactions) {
      if (existingExternalIds.has(txn.externalId)) {
        skipped++;
        continue;
      }
      await appendRow(SHEET, txn as unknown as Record<string, string | number>);
      imported++;
    }

    return jsonResponse({
      source,
      imported,
      skipped,
      total: newTransactions.length,
    });
  } catch (error) {
    console.error('POST /api/transactions error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return errorResponse(`Failed to sync transactions: ${message}`, 500);
  }
}
