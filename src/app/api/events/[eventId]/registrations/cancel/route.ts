export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { eventParticipantRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const { email } = await request.json();
    if (!email) return errorResponse('email is required', 400);

    const emailLower = email.trim().toLowerCase();
    const participant = await eventParticipantRepository.findByEventIdAndEmail(params.eventId, emailLower);

    if (!participant) {
      return errorResponse('No registration found for this email', 404);
    }
    if (participant.registrationStatus === 'cancelled') {
      return errorResponse('This registration is already cancelled', 400);
    }
    if (participant.checkedInAt) {
      return errorResponse('Cannot cancel a registration that has already been checked in', 400);
    }

    await eventParticipantRepository.update(participant.id, {
      ...participant,
      registrationStatus: 'cancelled',
    });

    logActivity({
      userEmail: emailLower,
      action: 'update',
      entityType: 'Registration',
      entityId: participant.id,
      entityLabel: participant.name || emailLower,
      description: 'Cancelled registration (self-service)',
    });

    return jsonResponse({ success: true, message: 'Registration cancelled successfully' });
  } catch (error) {
    return errorResponse('Failed to cancel registration', 500, error);
  }
}
