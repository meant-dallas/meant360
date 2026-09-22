import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody, isRegistrationOwnerOrStaff, getSessionRole } from '@/lib/api-helpers';
import { itemsRegistrationCreateSchema } from '@/types/schemas';
import { createItemsRegistration, getItemsRegistrationsForEvent, ItemSoldOutError, EventSlotsFullError, GuestsNotAllowedError, GuestEmailDomainNotAllowedError } from '@/services/event-items.service';
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
    // Admin/committee bypass this the same way every other items-registration
    // route does (checkin, edit, cancel, participants) — this route was the
    // one inconsistent holdout, calling hasValidGuestSession directly instead
    // of isRegistrationOwnerOrStaff, which meant staff got the same "please
    // verify your email" 401 as an expired guest session would.
    const authorized = await isRegistrationOwnerOrStaff(request, params.eventId, validated.contactEmail);
    if (!authorized) {
      return errorResponse('Please verify your email before registering', 401);
    }

    // isManualEntry is a client-signaled intent, not a grant — only honored
    // when the caller's own session role is actually admin/committee (staff
    // recording a registration to reconcile a payment that never made it
    // into the table; see /api/events/[eventId]/unmatched-payments). A
    // guest's isRegistrationOwnerOrStaff pass above doesn't imply staff.
    const { role, email: sessionEmail, authenticated } = await getSessionRole();
    const isStaff = authenticated && (role === 'admin' || role === 'committee');
    const { isManualEntry, manualEntryReason, ...registrationInput } = validated;

    const record = await createItemsRegistration(params.eventId, {
      ...registrationInput,
      ...(isManualEntry && isStaff
        ? { manualEntry: { recordedByEmail: sessionEmail, reason: manualEntryReason || undefined } }
        : {}),
    });
    return jsonResponse(record, 201);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    if (error instanceof ItemSoldOutError) return errorResponse(error.message, 409);
    if (error instanceof EventSlotsFullError) return errorResponse(error.message, 409);
    if (error instanceof GuestsNotAllowedError) return errorResponse(error.message, 403);
    if (error instanceof GuestEmailDomainNotAllowedError) return errorResponse(error.message, 403);
    console.error('POST /api/events/[eventId]/items-registrations error:', error);
    return errorResponse('Failed to register', 500, error);
  }
}
