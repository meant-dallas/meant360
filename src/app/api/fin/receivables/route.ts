export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finReceivableService } from '@/services/fin-receivable.service';
import { finReceivableCreateSchema, finReceivableUpdateSchema } from '@/types/fin-schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const data = await finReceivableService.list(status);
    return jsonResponse(data);
  } catch (error) {
    return errorResponse('Failed to list receivables', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finReceivableCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const record = await finReceivableService.create(parsed);
    return jsonResponse(record, 201);
  } catch (error) {
    return errorResponse('Failed to create receivable', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return errorResponse('ID is required', 400);

    const parsed = await validateBody(finReceivableUpdateSchema, data);
    if (parsed instanceof Response) return parsed;

    const record = await finReceivableService.update(id, parsed);
    return jsonResponse(record);
  } catch (error) {
    return errorResponse('Failed to update receivable', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return errorResponse('ID is required', 400);

    await finReceivableService.delete(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse('Failed to delete receivable', 500, error);
  }
}
