import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { getSquareReaderCheckoutStatus } from '@/services/payments.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Polled by the check-in page after it's redirected back from the Square
// app, gated only by possession of the token (same reasoning as the
// callback route — there is no session to check at this point).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return errorResponse('token is required', 400);

  try {
    const result = await getSquareReaderCheckoutStatus(token);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/payments/square-reader/status error:', error);
    Sentry.captureException(error, { extra: { context: 'Square Reader status', token } });
    return errorResponse('Failed to fetch checkout status', 500, error);
  }
}
