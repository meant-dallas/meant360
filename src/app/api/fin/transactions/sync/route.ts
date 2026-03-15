export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finTransactionService } from '@/services/fin-transaction.service';
import { z } from 'zod';

const syncSchema = z.object({
  provider: z.enum(['square', 'paypal']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const validation = await validateBody(syncSchema, body);
  if (validation instanceof Response) return validation;
  const { provider, startDate, endDate } = validation;

  try {
    let result;
    if (provider === 'square') {
      result = await finTransactionService.syncSquare(startDate, endDate);
    } else {
      result = await finTransactionService.syncPayPal(startDate, endDate);
    }
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to sync ${provider} transactions`;
    return errorResponse(message, 500, error);
  }
}
