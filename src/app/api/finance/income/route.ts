import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { incomeCreateSchema, incomeUpdateSchema } from '@/types/schemas';
import { incomeService } from '@/services/finance.service';
import { NotFoundError } from '@/services/crud.service';
import { eventParticipantRepository, eventRepository, sponsorRepository } from '@/repositories';

interface IncomeRow {
  id: string;
  incomeType: string;
  eventName: string;
  eventId: string;
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

    // Fetch manual income + all related data in parallel
    const [manualRows, participants, events, sponsorships] = await Promise.all([
      incomeService.list({ eventName: eventFilter }),
      eventParticipantRepository.findAll(),
      eventRepository.findAll(),
      sponsorRepository.findAll(),
    ]);

    // Build event ID → name lookup
    const eventNameMap = new Map<string, string>();
    for (const evt of events) {
      eventNameMap.set(evt.id, evt.name);
    }

    // Aggregate participant income by event (one row per event)
    const eventAgg = new Map<string, { eventId: string; eventName: string; total: number; paidCount: number; totalCount: number; latestDate: string; methods: Set<string> }>();
    for (const r of participants) {
      const amt = parseFloat(r.totalPrice || '0');
      if (amt <= 0) continue;
      const eid = r.eventId;
      if (!eventAgg.has(eid)) {
        eventAgg.set(eid, {
          eventId: eid,
          eventName: eventNameMap.get(eid) || eid,
          total: 0,
          paidCount: 0,
          totalCount: 0,
          latestDate: '',
          methods: new Set(),
        });
      }
      const agg = eventAgg.get(eid)!;
      if (r.paymentStatus === 'paid') {
        agg.total += amt;
        agg.paidCount++;
      }
      agg.totalCount++;
      const dateStr = (r.registeredAt || r.checkedInAt || '').split('T')[0];
      if (dateStr > agg.latestDate) agg.latestDate = dateStr;
      if (r.paymentMethod) agg.methods.add(r.paymentMethod);
    }

    const eventIncome: IncomeRow[] = [];
    eventAgg.forEach((agg) => {
      eventIncome.push({
        id: `evt_${agg.eventId}`,
        incomeType: 'Event',
        eventName: agg.eventName,
        eventId: agg.eventId,
        amount: String(agg.total),
        date: agg.latestDate,
        paymentMethod: Array.from(agg.methods).join(', '),
        payerName: `${agg.paidCount} paid of ${agg.totalCount}`,
        notes: '',
        _source: 'event',
      });
    });

    // Filter manual income rows: exclude auto-created entries that duplicate participant data
    const manual = manualRows
      .filter((r) => {
        const notes = (r.notes || '').toLowerCase();
        if (notes.includes('auto-created from')) return false;
        return true;
      })
      .map((r) => ({ ...r, eventId: '', _source: 'manual' } as IncomeRow));

    // Map sponsorships with status 'Paid' and amount > 0
    const spIncome = sponsorships
      .filter((r) => r.status === 'Paid' && parseFloat(r.amount || '0') > 0)
      .map((r): IncomeRow => ({
        id: `sp_${r.id}`,
        incomeType: 'Sponsorship',
        eventName: r.eventName || '',
        eventId: '',
        amount: r.amount,
        date: r.paymentDate || '',
        paymentMethod: r.paymentMethod || '',
        payerName: r.name || '',
        notes: r.notes || '',
        _source: 'sponsorship',
      }));

    // Merge: aggregated event entries + non-duplicate manual + sponsorships
    let combined = [...eventIncome, ...manual, ...spIncome];

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
    return errorResponse('Failed to fetch income records', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(incomeCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await incomeService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/income error:', error);
    return errorResponse('Failed to create income record', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(incomeUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await incomeService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/income error:', error);
    return errorResponse('Failed to update income record', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await incomeService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/income error:', error);
    return errorResponse('Failed to delete income record', 500, error);
  }
}
