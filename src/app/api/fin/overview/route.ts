export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { finReportsService } from '@/services/fin-reports.service';
import { finTransactionService } from '@/services/fin-transaction.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const url = request.nextUrl.searchParams;
    const startDate = url.get('startDate') || `${new Date().getFullYear()}-01-01`;
    const endDate = url.get('endDate') || new Date().toISOString().slice(0, 10);

    const [overview, txnStats] = await Promise.all([
      finReportsService.overview(startDate, endDate),
      finTransactionService.getStats(),
    ]);

    return jsonResponse({
      ...overview,
      transactionStats: txnStats,
    });
  } catch (error) {
    return errorResponse('Failed to get overview', 500, error);
  }
}
