export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finLedgerService } from '@/services/fin-ledger.service';
import { finLedgerGenerateSchema } from '@/types/fin-schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finLedgerGenerateSchema, body);
    if (parsed instanceof Response) return parsed;

    const entries = await finLedgerService.generateFromTransactions(parsed.transactionIds);
    return jsonResponse({ generated: entries.length, entries }, 201);
  } catch (error) {
    return errorResponse('Failed to generate ledger entries', 500, error);
  }
}
