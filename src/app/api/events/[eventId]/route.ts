import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { getPublicDetail } from '@/services/events.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const detail = await getPublicDetail(params.eventId);
    return jsonResponse(detail);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/events/[eventId] error:', error);
    return errorResponse('Failed to fetch event', 500, error);
  }
}
