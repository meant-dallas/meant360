import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff } from '@/lib/api-helpers';
import { itemsAddWalkInSchema } from '@/types/schemas';
import { addWalkInAttendee, RegistrationCancelledError } from '@/services/event-items.service';
import { eventItemRegistrationRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// "Add walk-in attendee" at check-in — grows the General Attendance headcount
// on an existing registration. Same authorization as check-in itself: the
// verified registrant (self-service) or an admin/committee staff member.
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsAddWalkInSchema, body);
    if (validated instanceof NextResponse) return validated;

    const registration = await eventItemRegistrationRepository.findById(params.registrationId);
    if (!registration) return errorResponse('Registration not found', 404);

    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, registration.contactEmail);
    if (!authorized) return errorResponse('Please verify your email before adding an attendee', 401);

    const result = await addWalkInAttendee(params.registrationId, validated);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof RegistrationCancelledError) return errorResponse(error.message, 400);
    console.error('POST /api/events/[eventId]/items-registrations/[registrationId]/participants error:', error);
    return errorResponse('Failed to add attendee', 500, error);
  }
}
