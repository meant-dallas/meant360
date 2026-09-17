import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff } from '@/lib/api-helpers';
import { itemsCancelRegistrationSchema } from '@/types/schemas';
import { cancelItemsRegistrationWithRefund } from '@/services/event-items.service';
import { eventItemRegistrationRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Self-service cancel — the registrant themselves (OTP-verified guest
// session for this event + email, see items-otp route) or staff can cancel.
// Cancellation is always offered; the event's Self-Service Cancel & Refund
// toggle only controls whether the refund is attempted automatically vs.
// flagged for manual handling (see cancelItemsRegistrationWithRefund).
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = await validateBody(itemsCancelRegistrationSchema, body);
    if (validated instanceof NextResponse) return validated;

    const registration = await eventItemRegistrationRepository.findById(params.registrationId);
    if (!registration) return errorResponse('Registration not found', 404);

    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, registration.contactEmail);
    if (!authorized) return errorResponse('Please verify your email before cancelling this registration', 401);

    const result = await cancelItemsRegistrationWithRefund(params.registrationId, { reason: validated.reason });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('POST /api/events/[eventId]/items-registrations/[registrationId]/cancel error:', error);
    return errorResponse('Failed to cancel registration', 500, error);
  }
}
