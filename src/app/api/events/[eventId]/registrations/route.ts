import { NextRequest, NextResponse } from 'next/server';
import { eventParticipantRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { participantCreateSchema } from '@/types/schemas';
import { registerParticipant, updateRegistration, updateMemberProfile } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';

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
    });

    if (validated.profileUpdate && validated.memberId) {
      try {
        const profileData = JSON.parse(validated.profileUpdate);
        await updateMemberProfile(validated.memberId, profileData);
      } catch (e) {
        console.error('Profile update failed:', e);
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
    if (message.includes('Already registered') || message.includes('not open') || message.includes('not allowed')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to register', 500, error);
  }
}

export async function PATCH(
  request: NextRequest,
) {
  try {
    const body = await request.json();
    const { participantId, ...data } = body;
    if (!participantId) {
      return errorResponse('participantId is required', 400);
    }

    const updated = await updateRegistration(participantId, {
      name: data.name || '',
      phone: data.phone || '',
      adults: data.adults || 0,
      kids: data.kids || 0,
      totalPrice: data.totalPrice || '0',
      priceBreakdown: data.priceBreakdown || '',
      paymentStatus: data.paymentStatus || '',
      paymentMethod: data.paymentMethod || '',
      transactionId: data.transactionId || '',
      selectedActivities: data.selectedActivities || '',
      customFields: data.customFields || '',
      city: data.city,
      referredBy: data.referredBy,
    });

    if (data.profileUpdate && data.memberId) {
      try {
        const profileData = JSON.parse(data.profileUpdate);
        await updateMemberProfile(data.memberId, profileData);
      } catch (e) {
        console.error('Profile update failed:', e);
      }
    }

    logActivity({
      userEmail: updated.email || data.email || '',
      action: 'update',
      entityType: 'Registration',
      entityId: participantId,
      entityLabel: updated.name || data.name || '',
      description: `Updated registration: ${updated.name || data.name || ''}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update registration';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('PATCH /api/events/[eventId]/registrations error:', error);
    return errorResponse('Failed to update registration', 500, error);
  }
}
