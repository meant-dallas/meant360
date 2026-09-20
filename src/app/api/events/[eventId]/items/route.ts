import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { getItemsEventPublicDetail } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const data = await getItemsEventPublicDetail(params.eventId);
    return jsonResponse(data);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/events/[eventId]/items error:', error);
    return errorResponse('Failed to fetch event items', 500, error);
  }
}
