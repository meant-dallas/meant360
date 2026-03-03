import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { guestCreateSchema, guestUpdateSchema } from '@/types/schemas';
import { guestService, searchGuests } from '@/services/members.service';
import { getMultipleRows } from '@/lib/google-sheets';
import { SHEET_TABS } from '@/types';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include');
    const rows = await searchGuests(searchParams.get('search') || '');

    if (include === 'events') {
      const data = await getMultipleRows([SHEET_TABS.EVENT_PARTICIPANTS, SHEET_TABS.EVENTS]);
      const participants = data[SHEET_TABS.EVENT_PARTICIPANTS] || [];
      const events = data[SHEET_TABS.EVENTS] || [];
      const eventMap = new Map(events.map((e) => [e.id, e.name]));

      // Build guestId → event names map
      const guestEventsMap = new Map<string, string[]>();
      for (const p of participants) {
        if (p.type !== 'Guest' || !p.guestId) continue;
        const eventName = eventMap.get(p.eventId) || 'Unknown Event';
        const existing = guestEventsMap.get(p.guestId) || [];
        if (!existing.includes(eventName)) existing.push(eventName);
        guestEventsMap.set(p.guestId, existing);
      }

      const enriched = rows.map((g) => ({
        ...g,
        eventNames: guestEventsMap.get(g.id) || [],
      }));

      return jsonResponse(enriched);
    }

    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/guests error:', error);
    return errorResponse('Failed to fetch guests', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(guestCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await guestService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/guests error:', error);
    return errorResponse('Failed to create guest', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(guestUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await guestService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/guests error:', error);
    return errorResponse('Failed to update guest', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await guestService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/guests error:', error);
    return errorResponse('Failed to delete guest', 500, error);
  }
}
