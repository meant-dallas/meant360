import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { hasValidGuestSession } from '@/lib/guest-session';
import { itemsRegistrationCreateSchema } from '@/types/schemas';
import { createItemsRegistration, getItemsRegistrationsForEvent, ItemSoldOutError, GuestsNotAllowedError } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await getItemsRegistrationsForEvent(params.eventId);
    return jsonResponse(rows);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('GET /api/events/[eventId]/items-registrations error:', error);
    return errorResponse('Failed to fetch registrations', 500, error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsRegistrationCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    // Registrant must have completed OTP verification for this exact email +
    // event (see /api/events/[eventId]/items-otp) before a registration can
    // be recorded under that email — this is what makes the memberId this
    // body carries trustworthy for member pricing, not just a client claim.
    if (!hasValidGuestSession(request, validated.contactEmail, params.eventId)) {
      return errorResponse('Please verify your email before registering', 401);
    }

    const record = await createItemsRegistration(params.eventId, validated);
    return jsonResponse(record, 201);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof ItemSoldOutError) return errorResponse(error.message, 409);
    if (error instanceof GuestsNotAllowedError) return errorResponse(error.message, 403);
    console.error('POST /api/events/[eventId]/items-registrations error:', error);
    return errorResponse('Failed to register', 500, error);
  }
}
