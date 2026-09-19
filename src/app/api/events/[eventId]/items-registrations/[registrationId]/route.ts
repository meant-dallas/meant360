import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff, getSessionRole } from '@/lib/api-helpers';
import { itemsRegistrationUpdateSchema } from '@/types/schemas';
import { updateItemsRegistration, ItemSoldOutError, GuestsNotAllowedError, SelfServiceEditDisabledError, RegistrationCancelledError } from '@/services/event-items.service';
import { eventItemRegistrationRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Self-service edit — the registrant themselves (OTP-verified guest session
// for this event + email, see items-otp route) or staff can update an
// existing registration. Gated server-side by the event's Self-Service Edit
// toggle for non-staff callers (see updateItemsRegistration).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(itemsRegistrationUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const registration = await eventItemRegistrationRepository.findById(params.registrationId);
    if (!registration) return errorResponse('Registration not found', 404);

    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, registration.contactEmail);
    if (!authorized) return errorResponse('Please verify your email before editing this registration', 401);

    const { role } = await getSessionRole();
    const isAdminOrCommittee = role === 'admin' || role === 'committee';

    const result = await updateItemsRegistration(params.registrationId, validated, { isAdminOrCommittee });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof ItemSoldOutError) return errorResponse(error.message, 409);
    if (error instanceof GuestsNotAllowedError) return errorResponse(error.message, 403);
    if (error instanceof SelfServiceEditDisabledError) return errorResponse(error.message, 403);
    if (error instanceof RegistrationCancelledError) return errorResponse(error.message, 409);
    console.error('PATCH /api/events/[eventId]/items-registrations/[registrationId] error:', error);
    return errorResponse('Failed to update registration', 500, error);
  }
}
