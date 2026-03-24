import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { searchSchema } from '@/types/schemas';
import { search } from '@/services/events.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(searchSchema, body);
    if (validated instanceof NextResponse) return validated;

    const results = await search(params.eventId, validated.query);
    return jsonResponse(results);
  } catch (error) {
    console.error('POST /api/events/[eventId]/search error:', error);
    Sentry.captureException(error, { extra: { context: 'Event search POST' } });
    return errorResponse('Search failed', 500, error);
  }
}
