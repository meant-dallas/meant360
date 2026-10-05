import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff } from '@/lib/api-helpers';
import { itemsCheckinBatchSchema } from '@/types/schemas';
import { checkinItemsParticipants, MembershipRenewalRequiredError } from '@/services/event-items.service';
import { eventItemRegistrationRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Front desk checks in everyone selected in one request instead of one per
// person — see checkinItemsParticipants for why this is also meaningfully
// faster than firing the single-participant endpoint N times in parallel
// (the registration fetch and membership gate run once, not once per id).
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsCheckinBatchSchema, body);
    if (validated instanceof NextResponse) return validated;

    const registration = await eventItemRegistrationRepository.findById(params.registrationId);
    if (!registration) return errorResponse('Registration not found', 404);

    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, registration.contactEmail);
    if (!authorized) return errorResponse('Please verify your email before checking in', 401);

    const result = await checkinItemsParticipants(params.registrationId, validated.participantIds, { membershipRenewal: validated.membershipRenewal });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof MembershipRenewalRequiredError) return errorResponse(error.message, 402);
    console.error('POST /api/events/[eventId]/items-registrations/[registrationId]/checkin-batch error:', error);
    return errorResponse('Failed to check in', 500, error);
  }
}
