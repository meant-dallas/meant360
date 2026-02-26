import { NextRequest, NextResponse } from 'next/server';
import { getRows } from '@/lib/google-sheets';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { SHEET_TABS } from '@/types';
import { checkinCreateSchema } from '@/types/schemas';
import { checkin } from '@/services/events.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await getRows(SHEET_TABS.EVENT_CHECKINS);
    const filtered = rows.filter((r) => r.eventId === params.eventId);
    return jsonResponse(filtered);
  } catch (error) {
    console.error('GET /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to fetch check-ins', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(checkinCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await checkin(params.eventId, {
      type: validated.type,
      memberId: validated.memberId || '',
      guestId: validated.guestId || '',
      name: validated.name,
      email: validated.email,
      phone: validated.phone || '',
      adults: validated.adults || 0,
      kids: validated.kids || 0,
      totalPrice: validated.totalPrice || '0',
      priceBreakdown: validated.priceBreakdown || '',
      paymentStatus: validated.paymentStatus || '',
      paymentMethod: validated.paymentMethod || '',
      transactionId: validated.transactionId || '',
      city: validated.city,
      referredBy: validated.referredBy,
    });
    return jsonResponse(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check in';
    if (message.includes('not found')) return errorResponse(message, 404);
    if (message.includes('cancelled')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to check in', 500);
  }
}
