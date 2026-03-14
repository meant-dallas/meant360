import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAdmin, validateBody } from '@/lib/api-helpers';
import { incomeCreateSchema } from '@/types/schemas';
import { incomeService } from '@/services/finance.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/income — Create income and a corresponding ledger entry (type INCOME).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(incomeCreateSchema, body);
    if (validated instanceof Response) return validated;

    const record = await incomeService.create(
      validated as unknown as Record<string, unknown>,
      { userEmail: auth.email },
    );
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/income error:', error);
    return errorResponse('Failed to create income record', 500, error);
  }
}
