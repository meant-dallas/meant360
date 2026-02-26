import { NextRequest, NextResponse } from 'next/server';
import { getRows } from '@/lib/google-sheets';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { SHEET_TABS } from '@/types';
import { registrationCreateSchema } from '@/types/schemas';
import { register } from '@/services/events.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await getRows(SHEET_TABS.EVENT_REGISTRATIONS);
    const filtered = rows.filter((r) => r.eventId === params.eventId);
    return jsonResponse(filtered);
  } catch (error) {
    console.error('GET /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to fetch registrations', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(registrationCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await register(params.eventId, {
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
    const message = error instanceof Error ? error.message : 'Failed to register';
    if (message.includes('not found')) return errorResponse(message, 404);
    if (message.includes('Already registered') || message.includes('not open')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to register', 500);
  }
}
