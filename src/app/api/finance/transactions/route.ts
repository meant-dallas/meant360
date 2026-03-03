import { NextRequest, NextResponse } from 'next/server';
import {
  transactionRepository,
  incomeRepository,
  expenseRepository,
  eventParticipantRepository,
  eventRepository,
  sponsorRepository,
} from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { fetchSquareTransactions } from '@/lib/square';
import { fetchPayPalTransactions } from '@/lib/paypal';
import { transactionSyncSchema, transactionUpdateSchema } from '@/types/schemas';
import { logActivity } from '@/lib/audit-log';
import { generateId } from '@/lib/utils';

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

    let rows = await transactionRepository.findAll();

    if (source) rows = rows.filter((r) => r.source === source);
    if (tag) rows = rows.filter((r) => r.tag === tag);
    if (startDate) rows = rows.filter((r) => r.date >= startDate);
    if (endDate) rows = rows.filter((r) => r.date <= endDate);

    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/transactions error:', error);
    return errorResponse('Failed to fetch transactions', 500, error);
  }
}

async function getUnifiedLedger(
  startDate: string | null,
  endDate: string | null,
  typeFilter: string | null,
) {
  // Fetch all sources in parallel
  const [income, expenses, syncedTxns, participants, events, sponsorships] = await Promise.all([
    incomeRepository.findAll(),
    expenseRepository.findAll(),
    transactionRepository.findAll(),
    eventParticipantRepository.findAll(),
    eventRepository.findAll(),
    sponsorRepository.findAll(),
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

  // Event participants with totalPrice > 0 → type "Income"
  for (const r of participants) {
    const price = parseFloat(r.totalPrice || '0');
    if (price <= 0) continue;
    const dateStr = r.registeredAt || r.checkedInAt || '';
    const source = r.registeredAt ? 'Registration' : 'Check-in';
    unified.push({
      id: `ptc_${r.id}`,
      date: dateStr ? dateStr.split('T')[0] : '',
      type: 'Income',
      category: 'Event Entry',
      description: r.priceBreakdown || `Event ${source}`,
      amount: price,
      payerPayee: r.name || '',
      eventName: eventNameMap.get(r.eventId) || r.eventId,
      source,
      paymentMethod: r.paymentMethod || '',
    });
  }

  // Sponsorships → type "Income", positive amount
  for (const r of sponsorships) {
    const amt = parseFloat(r.amount || '0');
    if (amt <= 0) continue;
    unified.push({
      id: `spon_${r.id}`,
      date: r.paymentDate || '',
      type: 'Income',
      category: 'Sponsorship',
      description: `${r.type || ''} sponsorship${r.notes ? ' - ' + r.notes : ''}`,
      amount: amt,
      payerPayee: r.name || '',
      eventName: r.eventName || '',
      source: 'Sponsorship',
      paymentMethod: r.paymentMethod || '',
      status: r.status || 'Pending',
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

  // Expenses flagged for reimbursement → type "Reimbursement", show status
  for (const r of expenses) {
    if (r.needsReimbursement?.toLowerCase() !== 'true') continue;
    unified.push({
      id: `reimb_${r.id}`,
      date: r.date || '',
      type: 'Reimbursement',
      category: r.category || '',
      description: r.description || '',
      amount: -Math.abs(parseFloat(r.reimbAmount || r.amount || '0')),
      payerPayee: r.paidBy || '',
      eventName: r.eventName || '',
      source: 'Expense Sheet',
      paymentMethod: r.reimbMethod || '',
      status: r.reimbStatus || 'Pending',
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

    const existing = await transactionRepository.findById(validated.id);
    if (!existing) return errorResponse('Record not found', 404);

    const updated = { ...existing, ...validated } as Record<string, string>;
    await transactionRepository.update(validated.id, updated);
    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/transactions error:', error);
    return errorResponse('Failed to update transaction', 500, error);
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
    const existingRows = await transactionRepository.findAll();
    const existingExternalIds = new Set(existingRows.map((r) => r.externalId));

    let imported = 0;
    let skipped = 0;

    for (const txn of newTransactions) {
      if (existingExternalIds.has(txn.externalId)) {
        skipped++;
        continue;
      }
      await transactionRepository.create({ ...txn, id: generateId() } as unknown as Record<string, unknown>);
      imported++;
    }

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'Transaction Sync',
      entityId: `sync_${Date.now()}`,
      entityLabel: `${source} sync`,
      description: `Synced ${imported} ${source} transactions (${skipped} duplicates skipped)`,
    });

    return jsonResponse({
      source,
      imported,
      skipped,
      total: newTransactions.length,
    });
  } catch (error) {
    console.error('POST /api/transactions error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return errorResponse(`Failed to sync transactions: ${message}`, 500, error);
  }
}
