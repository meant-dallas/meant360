import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff } from '@/lib/api-helpers';
import { itemsWalkInRegistrationSchema } from '@/types/schemas';
import { createWalkInRegistration, ItemSoldOutError, GuestsNotAllowedError, GuestEmailDomainNotAllowedError } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// "Check in as a walk-in" — for an attendee with NO prior registration at
// all. Reachable only after the caller has already verified the email via
// OTP (see items-otp) and a lookup came back empty, or is admin/committee
// staff — same authorization every other items-registration action uses.
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsWalkInRegistrationSchema, body);
    if (validated instanceof NextResponse) return validated;

    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, validated.email);
    if (!authorized) return errorResponse('Please verify your email before checking in', 401);

    const record = await createWalkInRegistration(params.eventId, validated);
    return jsonResponse(record, 201);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof ItemSoldOutError) return errorResponse(error.message, 409);
    if (error instanceof GuestsNotAllowedError) return errorResponse(error.message, 403);
    if (error instanceof GuestEmailDomainNotAllowedError) return errorResponse(error.message, 403);
    console.error('POST /api/events/[eventId]/items-registrations/walkin-checkin error:', error);
    return errorResponse('Failed to check in', 500, error);
  }
}
