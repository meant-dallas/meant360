import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { eventRepository, registrationLedgerRepository } from '@/repositories';
import { parseActivities } from '@/lib/event-config';
import { buildHistoryRows, type EmailLedgerEntry } from '@/lib/registration-emails';

export const dynamic = 'force-dynamic';

/** A member's own registration/payment history across every event, grouped per event. */
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const entries = await registrationLedgerRepository.findByEmail(auth.email);
    if (entries.length === 0) return jsonResponse({ events: [] });

    const eventIds = Array.from(new Set(entries.map((e) => e.eventId)));
    const events = await Promise.all(eventIds.map((id) => eventRepository.findById(id)));
    const eventMap = new Map(events.filter(Boolean).map((e) => [e!.id, e!]));

    const groups = eventIds
      .map((eventId) => {
        const event = eventMap.get(eventId);
        const eventEntries = entries.filter((e) => e.eventId === eventId);
        const activities = parseActivities(event?.activities || '');
        const rows = buildHistoryRows(eventEntries as unknown as EmailLedgerEntry[], activities);
        return {
          eventId,
          eventName: event?.name || 'Unknown Event',
          eventDate: event?.date || '',
          rows,
          lastActivityAt: eventEntries[eventEntries.length - 1]?.createdAt || '',
        };
      })
      .sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));

    return jsonResponse({ events: groups });
  } catch (error) {
    console.error('GET /api/portal/payment-history error:', error);
    Sentry.captureException(error, { extra: { context: 'Portal payment history' } });
    return errorResponse('Failed to load payment history', 500, error);
  }
}
