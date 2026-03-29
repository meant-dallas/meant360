import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { eventParticipantRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, validateBody, getSessionRole } from '@/lib/api-helpers';
import { participantCreateSchema } from '@/types/schemas';
import { registerParticipant, updateRegistration, updateMemberProfile } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';

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
  try {
    const body = await request.json();
    const validated = await validateBody(participantCreateSchema, body);
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
      // Guest registrations require either a session OR a verified OTP token in the body.
      if (!authenticated) {
        const otpToken = (body as Record<string, unknown>).otpToken as string | undefined;
        if (!otpToken) {
          return errorResponse('Unauthorized: email verification required for guest registration', 401);
        }
        // Verify the OTP token (must be unused and not expired for this email)
        const tokenRecord = await (await import('@/lib/db')).prisma.loginToken.findFirst({
          where: {
            email: validated.email.toLowerCase(),
            token: otpToken,
            used: false,
            expiresAt: { gt: new Date() },
          },
        });
        if (!tokenRecord) {
          return errorResponse('Invalid or expired verification token', 401);
        }
        // Mark token as used
        await (await import('@/lib/db')).prisma.loginToken.update({
          where: { id: tokenRecord.id },
          data: { used: true },
        });
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
    return errorResponse('Failed to register', 500, error);
  }
}

export async function PATCH(
  request: NextRequest,
) {
  // Get session info but don't immediately require committee/admin role
  const { role, email, authenticated } = await getSessionRole();
  if (!authenticated) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const { participantId, paymentStatus, paymentMethod, totalPrice, transactionId, registrationStatus, ...data } = body;
    if (!participantId) {
      return errorResponse('participantId is required', 400);
    }

    // Get the participant to check ownership
    const participant = await eventParticipantRepository.findById(participantId);
    if (!participant) {
      return errorResponse('Participant not found', 404);
    }

    // Check if user has permission to update this registration
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isOwner = participant.email?.toLowerCase() === email?.toLowerCase();
    
    if (!isAdminOrCommittee && !isOwner) {
      return errorResponse('Forbidden: can only update your own registration', 403);
    }

    // If this is just a registration status update (e.g., cancel/withdraw)
    if (registrationStatus && !paymentStatus && !data.name && !data.adults && !data.kids) {
      const canChangeStatus = isAdminOrCommittee || (isOwner && registrationStatus === 'cancelled');
      if (!canChangeStatus) {
        return errorResponse('Forbidden: insufficient permissions to change registration status', 403);
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
    });

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
    console.error('PATCH /api/events/[eventId]/registrations error:', error);
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
