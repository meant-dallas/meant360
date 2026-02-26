import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { incomeCreateSchema, incomeUpdateSchema } from '@/types/schemas';
import { incomeService } from '@/services/finance.service';
import { NotFoundError } from '@/services/crud.service';
import { getRows } from '@/lib/google-sheets';
import { SHEET_TABS } from '@/types';

interface IncomeRow {
  id: string;
  incomeType: string;
  eventName: string;
  amount: string;
  date: string;
  paymentMethod: string;
  payerName: string;
  notes: string;
  _source: string;
  [key: string]: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const eventFilter = searchParams.get('event');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Fetch manual income, event registrations, and event checkins in parallel
    const [manualRows, registrations, checkins, events] = await Promise.all([
      incomeService.list({ eventName: eventFilter }),
      getRows(SHEET_TABS.EVENT_REGISTRATIONS),
      getRows(SHEET_TABS.EVENT_CHECKINS),
      getRows(SHEET_TABS.EVENTS),
    ]);

    // Build event ID → name lookup
    const eventNameMap = new Map<string, string>();
    for (const evt of events) {
      eventNameMap.set(evt.id, evt.name);
    }

    // Tag manual rows with source
    const manual = manualRows.map((r) => ({ ...r, _source: 'manual' } as IncomeRow));

    // Map registrations with totalPrice > 0
    const regIncome = registrations
      .filter((r) => parseFloat(r.totalPrice || '0') > 0)
      .map((r): IncomeRow => ({
        id: `reg_${r.id}`,
        incomeType: 'Event Entry',
        eventName: eventNameMap.get(r.eventId) || r.eventId,
        amount: r.totalPrice,
        date: r.registeredAt ? r.registeredAt.split('T')[0] : '',
        paymentMethod: r.paymentMethod || '',
        payerName: r.name || '',
        notes: r.priceBreakdown || '',
        _source: 'registration',
      }));

    // Map checkins with totalPrice > 0
    const chkIncome = checkins
      .filter((r) => parseFloat(r.totalPrice || '0') > 0)
      .map((r): IncomeRow => ({
        id: `chk_${r.id}`,
        incomeType: 'Event Entry',
        eventName: eventNameMap.get(r.eventId) || r.eventId,
        amount: r.totalPrice,
        date: r.checkedInAt ? r.checkedInAt.split('T')[0] : '',
        paymentMethod: r.paymentMethod || '',
        payerName: r.name || '',
        notes: r.priceBreakdown || '',
        _source: 'checkin',
      }));

    // Merge all sources
    let combined = [...manual, ...regIncome, ...chkIncome];

    // Apply event filter to event-sourced rows too
    if (eventFilter) {
      combined = combined.filter((r) => r.eventName === eventFilter);
    }

    // Apply date filters
    if (startDate) combined = combined.filter((r) => r.date >= startDate);
    if (endDate) combined = combined.filter((r) => r.date <= endDate);

    // Sort by date descending
    combined.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return jsonResponse(combined);
  } catch (error) {
    console.error('GET /api/income error:', error);
    return errorResponse('Failed to fetch income records', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(incomeCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await incomeService.create(validated as unknown as Record<string, unknown>);
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/income error:', error);
    return errorResponse('Failed to create income record', 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(incomeUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await incomeService.update(validated.id, validated as unknown as Record<string, unknown>);
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/income error:', error);
    return errorResponse('Failed to update income record', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await incomeService.remove(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/income error:', error);
    return errorResponse('Failed to delete income record', 500);
  }
}
