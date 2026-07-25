import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { eventRepository, registrationLedgerRepository } from '@/repositories';
import { parseActivities } from '@/lib/event-config';
import { buildHistoryRows, type EmailLedgerEntry } from '@/lib/registration-emails';

export const dynamic = 'force-dynamic';

/** Admin view of one registration's full ledger timeline (registered/edited/charged/refunded/cancelled). */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const participantId = request.nextUrl.searchParams.get('participantId');
  if (!participantId) return errorResponse('participantId is required', 400);

  try {
    const [entries, event] = await Promise.all([
      registrationLedgerRepository.findByParticipantId(participantId),
      eventRepository.findById(params.eventId),
    ]);
    const activities = parseActivities(event?.activities || '');
    const rows = buildHistoryRows(entries as unknown as EmailLedgerEntry[], activities);
    return jsonResponse({ rows });
  } catch (error) {
    console.error('GET /api/events/[eventId]/registrations/history error:', error);
    return errorResponse('Failed to load registration history', 500, error);
  }
}
