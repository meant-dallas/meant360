export const dynamic = 'force-dynamic';

import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { finReportsService } from '@/services/fin-reports.service';
import { finTransactionService } from '@/services/fin-transaction.service';
import { finReconciliationService } from '@/services/fin-reconciliation.service';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const [overview, txnStats, reconStats] = await Promise.all([
      finReportsService.overview(),
      finTransactionService.getStats(),
      finReconciliationService.getStats(),
    ]);

    return jsonResponse({
      ...overview,
      transactionStats: txnStats,
      reconciliationStats: reconStats,
    });
  } catch (error) {
    return errorResponse('Failed to get overview', 500, error);
  }
}
