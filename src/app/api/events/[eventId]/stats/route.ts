import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { getStats } from '@/services/events.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const stats = await getStats(params.eventId);
    return jsonResponse(stats);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/events/[eventId]/stats error:', error);
    return errorResponse('Failed to fetch event stats', 500, error);
  }
}
