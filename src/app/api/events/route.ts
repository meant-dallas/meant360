import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { eventCreateSchema, eventUpdateSchema } from '@/types/schemas';
import { eventService } from '@/services/events.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await eventService.list();
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/events error:', error);
    return errorResponse('Failed to fetch events', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(eventCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await eventService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/events error:', error);
    return errorResponse('Failed to create event', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(eventUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await eventService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/events error:', error);
    return errorResponse('Failed to update event', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await eventService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/events error:', error);
    return errorResponse('Failed to delete event', 500, error);
  }
}
