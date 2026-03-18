export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finTransactionService } from '@/services/fin-transaction.service';
import { z } from 'zod';

const splitSchema = z.object({
  transactionId: z.string(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(splitSchema, body);
    if (parsed instanceof Response) return parsed;

    const result = await finTransactionService.splitLifeMembership(parsed.transactionId);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to split transaction';
    return errorResponse(message, 400, error);
  }
}
