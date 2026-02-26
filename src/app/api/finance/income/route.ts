import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { incomeCreateSchema, incomeUpdateSchema } from '@/types/schemas';
import { incomeService } from '@/services/finance.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rows = await incomeService.list({
      eventName: searchParams.get('event'),
    });

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    let filtered = rows;
    if (startDate) filtered = filtered.filter((r) => r.date >= startDate);
    if (endDate) filtered = filtered.filter((r) => r.date <= endDate);

    return jsonResponse(filtered);
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
