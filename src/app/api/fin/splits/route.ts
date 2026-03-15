export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finSplitService } from '@/services/fin-split.service';
import { finSplitCreateSchema } from '@/types/fin-schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finSplitCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const splits = await finSplitService.createSplits(parsed.transactionId, parsed.splits);
    return jsonResponse(splits, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create splits';
    return errorResponse(msg, 400, error);
  }
}
