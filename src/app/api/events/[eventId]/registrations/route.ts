import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { eventParticipantRepository, eventRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, validateBody, getSessionRole } from '@/lib/api-helpers';
import { hasValidGuestSession } from '@/lib/guest-session';
import { participantCreateSchema } from '@/types/schemas';
import { registerParticipant, updateRegistration, updateMemberProfile, cancelRegistrationWithRefund } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';
import { notifyPaymentRegistrationMismatch } from '@/services/refunds.service';

export const dynamic = 'force-dynamic';
export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await eventParticipantRepository.findByEventId(params.eventId);
    const filtered = rows.filter((r) => r.registeredAt);
    return jsonResponse(filtered);
  } catch (error) {
    console.error('GET /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to fetch registrations', 500, error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  // Declared outside the try block so the catch below can still see it (and
  // check whether a payment was already captured) even if registerParticipant
  // is what throws.
  let validated: z.infer<typeof participantCreateSchema> | NextResponse | undefined;
  try {
    const body = await request.json();
    validated = await validateBody(participantCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    // --- Auth enforcement ---
    const { role, email: sessionEmail, authenticated } = await getSessionRole();
    const isAdminOrCommittee = role === 'admin' || role === 'committee';

    if (validated.type === 'Member') {
      // Member registrations require an authenticated session whose email matches,
      // unless the caller is admin/committee (manual override).
      if (!authenticated) {
        return errorResponse('Unauthorized: sign in to register as a member', 401);
      }
      if (
        !isAdminOrCommittee &&
        sessionEmail?.toLowerCase() !== validated.email.toLowerCase()
      ) {
        return errorResponse('Forbidden: can only register for your own account', 403);
      }
    } else {
      // Guest registrations require either a session OR a still-valid guest
      // session cookie from a recent OTP verification for this exact event.
      if (!authenticated && !hasValidGuestSession(request, validated.email, params.eventId)) {
        return errorResponse('Unauthorized: email verification required for guest registration', 401);
      }
    }
    // --- End auth enforcement ---

    const record = await registerParticipant(params.eventId, {
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
      selectedActivities: validated.selectedActivities || '',
      customFields: validated.customFields || '',
      city: validated.city,
      referredBy: validated.referredBy,
      membershipRenewal: validated.membershipRenewal || '',
      attendeeNames: validated.attendeeNames || '',
      emailConsent: validated.emailConsent,
      mediaConsent: validated.mediaConsent,
    });

    if (validated.profileUpdate && validated.memberId) {
      try {
        const profileData = JSON.parse(validated.profileUpdate);
        await updateMemberProfile(validated.memberId, profileData);
      } catch (e) {
        console.error('Profile update failed:', e);
        Sentry.captureException(e, { level: 'warning', extra: { context: 'Profile update during registration', memberId: validated.memberId } });
      }
    }

    logActivity({
      userEmail: validated.email,
      action: 'create',
      entityType: 'Registration',
      entityId: String(record.id),
      entityLabel: validated.name,
      description: `Registered for event (${validated.type})`,
      newRecord: record as Record<string, string | number>,
    });

    return jsonResponse(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register';
    if (message.includes('not found')) return errorResponse(message, 404);
    if (message.includes('Already registered') || message.includes('not open') || message.includes('not allowed') || message.includes('spots remaining')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/registrations error:', error);

    // validated is only set once parsing succeeded, so it's the paid PayPal/
    // Square charge the client already captured before this POST — this is
    // the "money moved, our save failed" case, not a normal validation/business
    // rejection (those all returned above).
    if (validated && !(validated instanceof NextResponse) && validated.paymentStatus === 'paid' && validated.transactionId) {
      const event = await eventRepository.findById(params.eventId).catch(() => null);
      await notifyPaymentRegistrationMismatch({
        flow: 'Legacy registration create',
        eventId: params.eventId,
        eventName: event?.name || params.eventId,
        payerName: validated.name,
        payerEmail: validated.email,
        amount: validated.totalPrice || 'unknown',
        paymentMethod: validated.paymentMethod || 'unknown',
        transactionId: validated.transactionId,
        error,
      });
    }

    return errorResponse('Failed to register', 500, error);
  }
}

export async function PATCH(
  request: NextRequest,
) {
  // Get session info but don't immediately require committee/admin role
  // Get session info but don't immediately require it — an unauthenticated
  // guest can still act on their own registration with a valid guest session
  // cookie from a recent OTP verification.
  const { role, email: sessionEmail, authenticated } = await getSessionRole();

  // Declared outside the try block so the catch below can still see them (and
  // check whether a payment was already captured) even if updateRegistration
  // is what throws.
  let paymentStatus: string | undefined;
  let paymentMethod: string | undefined;
  let totalPrice: string | undefined;
  let transactionId: string | undefined;
  let participant: Awaited<ReturnType<typeof eventParticipantRepository.findById>> | undefined;

  try {
    const body = await request.json();
    const { participantId, paymentStatus: bodyPaymentStatus, paymentMethod: bodyPaymentMethod, totalPrice: bodyTotalPrice, transactionId: bodyTransactionId, registrationStatus, recomputePrice, ...data } = body;
    paymentStatus = bodyPaymentStatus;
    paymentMethod = bodyPaymentMethod;
    totalPrice = bodyTotalPrice;
    transactionId = bodyTransactionId;
    if (!participantId) {
      return errorResponse('participantId is required', 400);
    }

    // Get the participant to check ownership
    participant = await eventParticipantRepository.findById(participantId);
    if (!participant) {
      return errorResponse('Participant not found', 404);
    }

    // Check if user has permission to update this registration
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isSessionOwner = authenticated && participant.email?.toLowerCase() === sessionEmail?.toLowerCase();
    const isOtpOwner = !authenticated && hasValidGuestSession(request, participant.email, participant.eventId);
    const isOwner = isSessionOwner || isOtpOwner;
    const email = sessionEmail || participant.email;

    Sentry.addBreadcrumb({
      category: 'registration-auth',
      message: 'PATCH ownership resolved',
      level: 'info',
      data: { participantId, authenticated, isAdminOrCommittee, isSessionOwner, isOtpOwner },
    });

    if (!isAdminOrCommittee && !isOwner) {
      Sentry.captureMessage('PATCH registration rejected — not owner or admin', {
        level: 'warning',
        extra: { participantId, authenticated },
      });
      return errorResponse(authenticated ? 'Forbidden: can only update your own registration' : 'Unauthorized', authenticated ? 403 : 401);
    }

    // If this is just a registration status update (e.g., cancel/withdraw)
    if (registrationStatus && !paymentStatus && !data.name && !data.adults && !data.kids) {
      const canChangeStatus = isAdminOrCommittee || (isOwner && registrationStatus === 'cancelled');
      if (!canChangeStatus) {
        return errorResponse('Forbidden: insufficient permissions to change registration status', 403);
      }

      // Cancelling — route through the refund-aware cancellation so paid
      // PayPal/Square registrations get auto-refunded.
      if (registrationStatus === 'cancelled') {
        const result = await cancelRegistrationWithRefund(participantId, { isAdminOrCommittee });
        if (result.status === 'already_cancelled') {
          return errorResponse('This registration is already cancelled', 400);
        }
        if (result.status === 'blocked_checked_in') {
          return errorResponse('Cannot cancel a registration that has already been checked in', 400);
        }
        if (result.status === 'blocked_discrepancy') {
          return errorResponse("We're reviewing your cancellation and will follow up shortly.", 409);
        }
        if (result.status === 'blocked_disabled') {
          return errorResponse('Self-service cancellation is not enabled for this event. Please contact us to cancel your registration.', 403);
        }

        logActivity({
          userEmail: email,
          action: 'update',
          entityType: 'Registration',
          entityId: participantId,
          entityLabel: participant.name || participantId,
          description: `Changed registration status to cancelled ${isOwner ? '(self)' : '(admin)'}`,
        });

        return jsonResponse({ ...participant, registrationStatus: 'cancelled', refundOutcome: result.refundOutcome });
      }

      await eventParticipantRepository.update(participantId, {
        ...participant,
        registrationStatus,
      });

      logActivity({
        userEmail: email,
        action: 'update',
        entityType: 'Registration',
        entityId: participantId,
        entityLabel: participant.name || participantId,
        description: `Changed registration status to ${registrationStatus} ${isOwner ? '(self)' : '(admin)'}`,
      });

      return jsonResponse({ ...participant, registrationStatus });
    }

    // If this is just a payment update (admin action), use updateParticipantPayment
    if (paymentStatus && !data.name && !data.adults && !data.kids) {
      // Only admin/committee can do payment-only updates
      if (!isAdminOrCommittee) {
        return errorResponse('Forbidden: insufficient permissions for payment updates', 403);
      }
      
      const { updateParticipantPayment } = await import('@/services/events.service');
      const updated = await updateParticipantPayment(participantId, {
        paymentStatus,
        paymentMethod: paymentMethod || '',
        totalPrice: totalPrice !== undefined ? String(totalPrice) : undefined,
      });

      logActivity({
        userEmail: email,
        action: 'update',
        entityType: 'Registration',
        entityId: participantId,
        entityLabel: updated.name || participantId,
        description: `Updated payment: ${paymentStatus} via ${paymentMethod || 'N/A'}`,
      });

      return jsonResponse(updated);
    }

    // Otherwise, this is a full registration update (allow for both admin and owner)
    const updated = await updateRegistration(participantId, {
      name: data.name || '',
      phone: data.phone || '',
      adults: data.adults || 0,
      kids: data.kids || 0,
      freeKids: data.freeKids,
      paidKids: data.paidKids,
      totalPrice: totalPrice || data.totalPrice || '0',
      priceBreakdown: data.priceBreakdown || '',
      paymentStatus: paymentStatus || data.paymentStatus || '',
      paymentMethod: paymentMethod || data.paymentMethod || '',
      transactionId: transactionId || data.transactionId || '',
      selectedActivities: data.selectedActivities || '',
      customFields: data.customFields || '',
      city: data.city,
      referredBy: data.referredBy,
      attendeeNames: data.attendeeNames || '',
    }, { skipPriceValidation: isAdminOrCommittee, isAdminOrCommittee, recomputePrice: !!recomputePrice });

    // Handle registration status update (admin/committee can set any status; owners can only cancel)
    if (registrationStatus && registrationStatus !== updated.registrationStatus) {
      if (!isAdminOrCommittee && !(isOwner && registrationStatus === 'cancelled')) {
        return errorResponse('Forbidden: insufficient permissions to change registration status', 403);
      }
      await eventParticipantRepository.update(participantId, {
        ...updated,
        registrationStatus,
        updatedAt: new Date().toISOString(),
      });
      updated.registrationStatus = registrationStatus;
    }

    if (data.profileUpdate && data.memberId) {
      try {
        const profileData = JSON.parse(data.profileUpdate);
        await updateMemberProfile(data.memberId, profileData);
      } catch (e) {
        console.error('Profile update failed:', e);
        Sentry.captureException(e, { level: 'warning', extra: { context: 'Profile update during registration update', memberId: data.memberId } });
      }
    }

    logActivity({
      userEmail: updated.email || data.email || email,
      action: 'update',
      entityType: 'Registration',
      entityId: participantId,
      entityLabel: updated.name || data.name || '',
      description: `Updated registration: ${updated.name || data.name || ''} ${isOwner ? '(self)' : '(admin)'}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update registration';
    if (message.includes('not found')) return errorResponse(message, 404);
    if (message.includes('not enabled') || message.includes('full for this event')) return errorResponse(message, 403);
    console.error('PATCH /api/events/[eventId]/registrations error:', error);

    // paymentStatus/transactionId are only set once the body was parsed, so a
    // paid value here is the PayPal/Square charge the client already captured
    // before this PATCH — this is the "money moved, our save failed" case,
    // not a normal validation/business rejection (those all returned above).
    if (participant && paymentStatus === 'paid' && transactionId) {
      const event = await eventRepository.findById(participant.eventId).catch(() => null);
      await notifyPaymentRegistrationMismatch({
        flow: 'Legacy registration update',
        eventId: participant.eventId,
        eventName: event?.name || participant.eventId,
        payerName: participant.name || 'Unknown',
        payerEmail: participant.email || 'unknown',
        amount: totalPrice || 'unknown',
        paymentMethod: paymentMethod || 'unknown',
        transactionId,
        error,
      });
    }

    return errorResponse('Failed to update registration', 500, error);
  }
}

export async function DELETE(
  request: NextRequest,
) {
  // Get session info but don't immediately require committee/admin role
  const { role, email, authenticated } = await getSessionRole();
  if (!authenticated) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const { participantId } = body;
    if (!participantId) {
      return errorResponse('participantId is required', 400);
    }

    // Get participant info before deletion for logging and ownership check
    const participant = await eventParticipantRepository.findById(participantId);
    if (!participant) {
      return errorResponse('Participant not found', 404);
    }

    // Check if user has permission to delete this registration
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isOwner = participant.email?.toLowerCase() === email?.toLowerCase();
    
    if (!isAdminOrCommittee && !isOwner) {
      return errorResponse('Forbidden: can only delete your own registration', 403);
    }

    // Delete the participant
    await eventParticipantRepository.delete(participantId);

    logActivity({
      userEmail: email,
      action: 'delete',
      entityType: 'Registration',
      entityId: participantId,
      entityLabel: participant.name || participantId,
      description: `Deleted registration: ${participant.name || participantId} ${isOwner ? '(self)' : '(admin)'}`,
    });

    return jsonResponse({ success: true, message: 'Registration deleted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete registration';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('DELETE /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to delete registration', 500, error);
  }
}
