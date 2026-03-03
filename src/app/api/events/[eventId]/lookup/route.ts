import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { lookupSchema } from '@/types/schemas';
import { lookup } from '@/services/events.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(lookupSchema, body);
    if (validated instanceof NextResponse) return validated;

    const result = await lookup(params.eventId, validated.email || '');
    return jsonResponse(result);
  } catch (error) {
    console.error('POST /api/events/[eventId]/lookup error:', error);
    return errorResponse('Lookup failed', 500, error);
  }
}
