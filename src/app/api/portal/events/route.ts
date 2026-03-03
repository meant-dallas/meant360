import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { eventParticipantRepository, eventRepository } from '@/repositories';
import { NextResponse } from 'next/server';

export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const [participants, events] = await Promise.all([
      eventParticipantRepository.findAll(),
      eventRepository.findAll(),
    ]);

    const eventMap = new Map(events.map((e) => [e.id, e]));
    const today = new Date().toISOString().split('T')[0];

    // History: participant records where memberId matches or email matches
    const myParticipations = participants.filter(
      (p) => p.memberId === auth.memberId || p.email?.toLowerCase() === auth.email.toLowerCase(),
    );

    const history = myParticipations
      .map((p) => {
        const event = eventMap.get(p.eventId);
        return {
          participantId: p.id,
          eventId: p.eventId,
          eventName: event?.name || 'Unknown Event',
          eventDate: event?.date || '',
          eventStatus: event?.status || '',
          registeredAdults: Number(p.registeredAdults) || 0,
          registeredKids: Number(p.registeredKids) || 0,
          checkedInAt: p.checkedInAt || '',
          selectedActivities: p.selectedActivities || '',
          totalPrice: p.totalPrice || '0',
          paymentStatus: p.paymentStatus || '',
          paymentMethod: p.paymentMethod || '',
          registeredAt: p.registeredAt || '',
        };
      })
      .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));

    // Upcoming: events with status=Upcoming and date >= today
    const registeredEventIds = new Set(myParticipations.map((p) => p.eventId));

    const upcoming = events
      .filter((e) => e.status === 'Upcoming' && e.date >= today)
      .map((e) => ({
        eventId: e.id,
        eventName: e.name,
        eventDate: e.date,
        description: e.description || '',
        registrationOpen: e.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
        isRegistered: registeredEventIds.has(e.id),
      }))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    return jsonResponse({ history, upcoming });
  } catch (error) {
    console.error('Portal events error:', error);
    return errorResponse('Failed to load events', 500, error);
  }
}
