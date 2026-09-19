import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff } from '@/lib/api-helpers';
import { itemsCheckinSchema } from '@/types/schemas';
import { checkinItemsParticipant } from '@/services/event-items.service';
import { eventItemRegistrationRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsCheckinSchema, body);
    if (validated instanceof NextResponse) return validated;

    const registration = await eventItemRegistrationRepository.findById(params.registrationId);
    if (!registration) return errorResponse('Registration not found', 404);

    // Self-service check-in requires the same OTP verification as
    // registration (see items-otp route); admin/committee can also check
    // people in directly from the event dashboard without it.
    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, registration.contactEmail);
    if (!authorized) return errorResponse('Please verify your email before checking in', 401);

    const record = await checkinItemsParticipant(params.registrationId, validated.participantId);
    return jsonResponse(record);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('POST /api/events/[eventId]/items-registrations/[registrationId]/checkin error:', error);
    return errorResponse('Failed to check in', 500, error);
  }
}
