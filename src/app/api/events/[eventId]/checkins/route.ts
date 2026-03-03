import { NextRequest, NextResponse } from 'next/server';
import { eventParticipantRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { participantCreateSchema } from '@/types/schemas';
import { checkinParticipant, updateParticipantPayment } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';

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
    if (message.includes('cancelled') || message.includes('not allowed')) return errorResponse(message, 400);
    console.error('POST /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to check in', 500, error);
  }
}

export async function PATCH(
  request: NextRequest,
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { participantId, paymentStatus, paymentMethod, totalPrice } = body;
    if (!participantId || !paymentStatus) {
      return errorResponse('participantId and paymentStatus are required', 400);
    }

    const updated = await updateParticipantPayment(participantId, {
      paymentStatus,
      paymentMethod: paymentMethod || '',
      totalPrice: totalPrice !== undefined ? String(totalPrice) : undefined,
    });

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'Check-in',
      entityId: participantId,
      entityLabel: updated.name || participantId,
      description: `Updated payment: ${paymentStatus} via ${paymentMethod || 'N/A'}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update payment';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('PATCH /api/events/[eventId]/checkins error:', error);
    return errorResponse('Failed to update payment', 500, error);
  }
}
