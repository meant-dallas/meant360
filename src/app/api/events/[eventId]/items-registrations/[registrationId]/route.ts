import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { jsonResponse, errorResponse, validateBody, isRegistrationOwnerOrStaff, getSessionRole } from '@/lib/api-helpers';
import { itemsRegistrationUpdateSchema } from '@/types/schemas';
import { updateItemsRegistration, ItemSoldOutError, EventSlotsFullError, GuestsNotAllowedError, SelfServiceEditDisabledError, RegistrationCancelledError } from '@/services/event-items.service';
import { eventItemRegistrationRepository, eventRepository } from '@/repositories';
import { NotFoundError } from '@/services/crud.service';
import { notifyPaymentRegistrationMismatch } from '@/services/refunds.service';

export const dynamic = 'force-dynamic';

// Self-service edit — the registrant themselves (OTP-verified guest session
// for this event + email, see items-otp route) or staff can update an
// existing registration. Gated server-side by the event's Self-Service Edit
// toggle for non-staff callers (see updateItemsRegistration).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string; registrationId: string } },
) {
  // Declared outside the try block so the catch below can still see them (and
  // check whether a payment was already captured) even if updateItemsRegistration
  // is what throws.
  let validated: z.infer<typeof itemsRegistrationUpdateSchema> | NextResponse | undefined;
  let registration: Awaited<ReturnType<typeof eventItemRegistrationRepository.findById>> | undefined;
  try {
    const body = await request.json();
    validated = await validateBody(itemsRegistrationUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    registration = await eventItemRegistrationRepository.findById(params.registrationId);
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
    if (error instanceof EventSlotsFullError) return errorResponse(error.message, 409);
    if (error instanceof GuestsNotAllowedError) return errorResponse(error.message, 403);
    if (error instanceof SelfServiceEditDisabledError) return errorResponse(error.message, 403);
    if (error instanceof RegistrationCancelledError) return errorResponse(error.message, 409);
    console.error('PATCH /api/events/[eventId]/items-registrations/[registrationId] error:', error);

    // validated is only set once parsing succeeded, so it's the paid PayPal/
    // Square charge the client already captured before this PATCH — this is
    // the "money moved, our save failed" case, not a normal validation/business
    // rejection (those all returned above).
    if (validated && !(validated instanceof NextResponse) && validated.paymentStatus === 'paid' && validated.transactionId) {
      const event = await eventRepository.findById(params.eventId).catch(() => null);
      await notifyPaymentRegistrationMismatch({
        flow: 'Items registration update',
        eventId: params.eventId,
        eventName: event?.name || params.eventId,
        payerName: validated.contactName || registration?.contactName || 'Unknown',
        payerEmail: registration?.contactEmail || 'unknown',
        amount: 'unknown — see transaction in Square/PayPal dashboard',
        paymentMethod: validated.paymentMethod || 'unknown',
        transactionId: validated.transactionId,
        error,
      });
    }

    return errorResponse('Failed to update registration', 500, error);
  }
}
