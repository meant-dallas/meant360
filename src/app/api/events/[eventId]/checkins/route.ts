import { NextRequest, NextResponse } from 'next/server';
import { eventParticipantRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, validateBody, getSessionRole } from '@/lib/api-helpers';
import { participantCreateSchema } from '@/types/schemas';
import { checkinParticipant, updateParticipantPayment } from '@/services/events.service';
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
    const filtered = rows.filter((r) => r.checkedInAt);
    return jsonResponse(filtered);
  } catch (error) {
    console.error('GET /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to fetch check-ins', 500, error);
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

    const record = await checkinParticipant(params.eventId, {
      type: validated.type,
      memberId: validated.memberId || '',
      guestId: validated.guestId || '',
      name: validated.name,
      email: validated.email,
      phone: validated.phone || '',
      adults: validated.actualAdults ?? validated.adults ?? 0,
      kids: validated.actualKids ?? validated.kids ?? 0,
      totalPrice: validated.totalPrice || '0',
      priceBreakdown: validated.priceBreakdown || '',
      paymentStatus: validated.paymentStatus || '',
      paymentMethod: validated.paymentMethod || '',
      transactionId: validated.transactionId || '',
      selectedActivities: validated.selectedActivities || '',
      customFields: validated.customFields || '',
      city: validated.city,
      referredBy: validated.referredBy,
      attendeeNames: validated.attendeeNames || '',
    });

    if (!(record as Record<string, unknown>).alreadyCheckedIn) {
      logActivity({
        userEmail: validated.email,
        action: 'create',
        entityType: 'Check-in',
        entityId: String((record as Record<string, unknown>).id || ''),
        entityLabel: validated.name,
        description: `Checked in for event (${validated.type})`,
      });
    }

    return jsonResponse(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check in';
    if (message.includes('not found')) return errorResponse(message, 404);
    if (message.includes('cancelled') || message.includes('not allowed') || message.includes('Already registered')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to check in', 500, error);
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
    const { participantId, paymentStatus, paymentMethod, totalPrice, transactionId, name, phone, actualAdults, actualKids, selectedActivities, attendeeNames, customFields } = body;
    if (!participantId) {
      return errorResponse('participantId is required', 400);
    }

    // Get the participant to check ownership
    const participant = await eventParticipantRepository.findById(participantId);
    if (!participant) {
      return errorResponse('Participant not found', 404);
    }

    // Check if user has permission to update this check-in
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isOwner = participant.email?.toLowerCase() === email?.toLowerCase();
    
    if (!isAdminOrCommittee && !isOwner) {
      return errorResponse('Forbidden: can only update your own check-in', 403);
    }

    // If this is just a payment update (has paymentStatus but no other edit fields)
    if (paymentStatus && !name && actualAdults === undefined) {
      // Only admin/committee can do payment-only updates
      if (!isAdminOrCommittee) {
        return errorResponse('Forbidden: insufficient permissions for payment updates', 403);
      }

      const updated = await updateParticipantPayment(participantId, {
        paymentStatus,
        paymentMethod: paymentMethod || '',
        totalPrice: totalPrice !== undefined ? String(totalPrice) : undefined,
      });

      logActivity({
        userEmail: email,
        action: 'update',
        entityType: 'Check-in',
        entityId: participantId,
        entityLabel: updated.name || participantId,
        description: `Updated payment: ${paymentStatus} via ${paymentMethod || 'N/A'}`,
      });

      return jsonResponse(updated);
    }

    // Otherwise, this is a full check-in edit
    const updated: Record<string, string> = {
      ...participant,
      name: name || participant.name,
      phone: phone || participant.phone || '',
      actualAdults: actualAdults !== undefined ? String(actualAdults) : participant.actualAdults || '',
      actualKids: actualKids !== undefined ? String(actualKids) : participant.actualKids || '',
      selectedActivities: selectedActivities !== undefined ? selectedActivities : participant.selectedActivities || '',
      attendeeNames: attendeeNames !== undefined ? attendeeNames : participant.attendeeNames || '',
      customFields: customFields !== undefined ? customFields : participant.customFields || '',
      paymentStatus: paymentStatus || participant.paymentStatus || '',
      paymentMethod: paymentMethod || participant.paymentMethod || '',
      totalPrice: totalPrice || participant.totalPrice || '0',
      transactionId: transactionId || participant.transactionId || '',
      updatedAt: new Date().toISOString(),
    };

    await eventParticipantRepository.update(participantId, updated);

    logActivity({
      userEmail: email,
      action: 'update',
      entityType: 'Check-in',
      entityId: participantId,
      entityLabel: updated.name || participantId,
      description: `Updated check-in: ${updated.name || participantId} ${isOwner ? '(self)' : '(admin)'}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update check-in';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('PATCH /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to update check-in', 500, error);
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

    // Check if user has permission to delete this check-in
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isOwner = participant.email?.toLowerCase() === email?.toLowerCase();
    
    if (!isAdminOrCommittee && !isOwner) {
      return errorResponse('Forbidden: can only delete your own check-in', 403);
    }

    // For check-ins, we have two options:
    // 1. If they were pre-registered, just clear the check-in data
    // 2. If they were walk-ins, delete the entire record
    if (participant.registeredAt) {
      // Pre-registered: clear check-in data but keep registration
      await eventParticipantRepository.update(participantId, {
        ...participant,
        checkedInAt: '',
        actualAdults: '',
        actualKids: '',
        updatedAt: new Date().toISOString(),
      });
      
      logActivity({
        userEmail: email,
        action: 'update',
        entityType: 'Check-in',
        entityId: participantId,
        entityLabel: participant.name || participantId,
        description: `Removed check-in: ${participant.name || participantId} ${isOwner ? '(self)' : '(admin)'}`,
      });

      return jsonResponse({ success: true, message: 'Check-in removed successfully' });
    } else {
      // Walk-in: delete the entire record
      await eventParticipantRepository.delete(participantId);
      
      logActivity({
        userEmail: email,
        action: 'delete',
        entityType: 'Check-in',
        entityId: participantId,
        entityLabel: participant.name || participantId,
        description: `Deleted walk-in: ${participant.name || participantId} ${isOwner ? '(self)' : '(admin)'}`,
      });

      return jsonResponse({ success: true, message: 'Walk-in deleted successfully' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete check-in';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('DELETE /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to delete check-in', 500, error);
  }
}
