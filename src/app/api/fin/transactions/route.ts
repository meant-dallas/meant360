export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finTransactionService } from '@/services/fin-transaction.service';
import { finTransactionCreateSchema, finTransactionUpdateSchema } from '@/types/fin-schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const url = request.nextUrl.searchParams;
    const result = await finTransactionService.list({
      status: url.get('status') || undefined,
      provider: url.get('provider') || undefined,
      type: url.get('type') || undefined,
      startDate: url.get('startDate') || undefined,
      endDate: url.get('endDate') || undefined,
      categoryId: url.get('categoryId') || undefined,
      eventId: url.get('eventId') || undefined,
      excluded: url.has('excluded') ? url.get('excluded') === 'true' : undefined,
      page: url.get('page') ? Number(url.get('page')) : undefined,
      pageSize: url.get('pageSize') ? Number(url.get('pageSize')) : undefined,
      sortBy: url.get('sortBy') || undefined,
      sortOrder: (url.get('sortOrder') as 'asc' | 'desc') || undefined,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse('Failed to list transactions', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finTransactionCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const netAmount = parsed.netAmount ?? parsed.grossAmount - parsed.fee;
    const txn = await finTransactionService.create({
      ...parsed,
      netAmount,
    });
    return jsonResponse(txn, 201);
  } catch (error) {
    return errorResponse('Failed to create transaction', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return errorResponse('id is required', 400);

    const parsed = await validateBody(finTransactionUpdateSchema, rest);
    if (parsed instanceof Response) return parsed;

    const txn = await finTransactionService.update(id, parsed);
    return jsonResponse(txn);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update transaction';
    return errorResponse(message, 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { id } = await request.json();
    if (!id) return errorResponse('id is required', 400);
    await finTransactionService.delete(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse('Failed to delete transaction', 500, error);
  }
}
