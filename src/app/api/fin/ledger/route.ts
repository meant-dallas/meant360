export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { finLedgerService } from '@/services/fin-ledger.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const url = request.nextUrl.searchParams;
    const result = await finLedgerService.list({
      type: url.get('type') || undefined,
      startDate: url.get('startDate') || undefined,
      endDate: url.get('endDate') || undefined,
      categoryId: url.get('categoryId') || undefined,
      accountId: url.get('accountId') || undefined,
      page: url.get('page') ? Number(url.get('page')) : undefined,
      pageSize: url.get('pageSize') ? Number(url.get('pageSize')) : undefined,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse('Failed to list ledger entries', 500, error);
  }
}
