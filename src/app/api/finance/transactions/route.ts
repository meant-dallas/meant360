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
    const source = searchParams.get('source');
    const tag = searchParams.get('tag');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

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
