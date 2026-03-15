export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finPayableService } from '@/services/fin-payable.service';
import { finPayableCreateSchema, finPayableUpdateSchema } from '@/types/fin-schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const data = await finPayableService.list(status);
    return jsonResponse(data);
  } catch (error) {
    return errorResponse('Failed to list payables', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finPayableCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const record = await finPayableService.create(parsed);
    return jsonResponse(record, 201);
  } catch (error) {
    return errorResponse('Failed to create payable', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return errorResponse('ID is required', 400);

    const parsed = await validateBody(finPayableUpdateSchema, data);
    if (parsed instanceof Response) return parsed;

    const record = await finPayableService.update(id, parsed);
    return jsonResponse(record);
  } catch (error) {
    return errorResponse('Failed to update payable', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return errorResponse('ID is required', 400);

    await finPayableService.delete(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse('Failed to delete payable', 500, error);
  }
}
