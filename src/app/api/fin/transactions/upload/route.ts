export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finTransactionService } from '@/services/fin-transaction.service';
import { finZelleUploadSchema } from '@/types/fin-schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finZelleUploadSchema, body);
    if (parsed instanceof Response) return parsed;

    const results = await finTransactionService.importZelleRows(parsed.rows);
    return jsonResponse({ imported: results.length, transactions: results }, 201);
  } catch (error) {
    return errorResponse('Failed to import Zelle data', 500, error);
  }
}
