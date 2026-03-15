export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { finClassificationService } from '@/services/fin-classification.service';
import { finClassifySchema } from '@/types/fin-schemas';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finClassifySchema, body);
    if (parsed instanceof Response) return parsed;

    const result = await finClassificationService.classify(
      parsed.transactionIds,
      parsed.categoryId,
      parsed.eventId,
    );
    return jsonResponse(result);
  } catch (error) {
    return errorResponse('Failed to classify transactions', 500, error);
  }
}
