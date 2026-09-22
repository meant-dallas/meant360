import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { getUnmatchedPaymentsForEvent } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Powers the "Add Registration" reconciliation flow on the admin event
// dashboard — FinRawTransaction income rows for this event with no
// matching registration, so staff can pick the right payment to attach a
// manually-recorded registration to instead of guessing at a transaction ID.
export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await getUnmatchedPaymentsForEvent(params.eventId);
    return jsonResponse(rows);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/events/[eventId]/unmatched-payments error:', error);
    return errorResponse('Failed to fetch unmatched payments', 500, error);
  }
}
