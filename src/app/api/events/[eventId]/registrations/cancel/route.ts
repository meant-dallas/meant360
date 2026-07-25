export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, getSessionRole, verifyAndConsumeOtpToken } from '@/lib/api-helpers';
import { eventParticipantRepository } from '@/repositories';
import { cancelRegistrationWithRefund } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const { email, otpToken } = await request.json();
    if (!email) return errorResponse('email is required', 400);

    const emailLower = email.trim().toLowerCase();
    const participant = await eventParticipantRepository.findByEventIdAndEmail(params.eventId, emailLower);

    if (!participant) {
      return errorResponse('No registration found for this email', 404);
    }

    // Verify the caller actually owns this registration — either a signed-in
    // session matching the email, or a verified OTP code for it.
    const { email: sessionEmail, authenticated } = await getSessionRole();
    const isSessionOwner = authenticated && sessionEmail?.toLowerCase() === emailLower;
    const isOtpOwner = !isSessionOwner && await verifyAndConsumeOtpToken(emailLower, otpToken);
    if (!isSessionOwner && !isOtpOwner) {
      Sentry.captureMessage('Self-service cancel rejected — not owner', {
        level: 'warning',
        extra: { eventId: params.eventId, participantId: participant.id, authenticated, hasOtpToken: !!otpToken },
      });
      return errorResponse('Unauthorized: email verification required', 401);
    }

    Sentry.addBreadcrumb({
      category: 'cancel-auth',
      message: 'Self-service cancel ownership verified',
      level: 'info',
      data: { eventId: params.eventId, participantId: participant.id, via: isSessionOwner ? 'session' : 'otp' },
    });

    const result = await cancelRegistrationWithRefund(participant.id);
    if (result.status === 'already_cancelled') {
      return errorResponse('This registration is already cancelled', 400);
    }
    if (result.status === 'blocked_checked_in') {
      return errorResponse('Cannot cancel a registration that has already been checked in', 400);
    }
    if (result.status === 'blocked_discrepancy') {
      return errorResponse("We're reviewing your cancellation and will follow up shortly.", 409);
    }

    logActivity({
      userEmail: emailLower,
      action: 'update',
      entityType: 'Registration',
      entityId: participant.id,
      entityLabel: participant.name || emailLower,
      description: 'Cancelled registration (self-service)',
    });

    return jsonResponse({ success: true, message: 'Registration cancelled successfully', refundOutcome: result.refundOutcome });
  } catch (error) {
    return errorResponse('Failed to cancel registration', 500, error);
  }
}
