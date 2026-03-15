export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finReconciliationService } from '@/services/fin-reconciliation.service';
import { finReconciliationCreateSchema } from '@/types/fin-schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finReconciliationCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const result = await finReconciliationService.create(
      parsed.transactionIds,
      auth.email,
      parsed.notes,
    );
    return jsonResponse(result, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create reconciliation';
    return errorResponse(msg, 400, error);
  }
}
