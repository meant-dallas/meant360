export const dynamic = 'force-dynamic';

import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { finReconciliationService } from '@/services/fin-reconciliation.service';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const groups = await finReconciliationService.listGroups();
    return jsonResponse(groups);
  } catch (error) {
    return errorResponse('Failed to list reconciliation groups', 500, error);
  }
}
