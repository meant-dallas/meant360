export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finTransactionService } from '@/services/fin-transaction.service';
import { finTransactionCreateSchema } from '@/types/fin-schemas';

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
      reconciled: url.has('reconciled') ? url.get('reconciled') === 'true' : undefined,
      page: url.get('page') ? Number(url.get('page')) : undefined,
      pageSize: url.get('pageSize') ? Number(url.get('pageSize')) : undefined,
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
