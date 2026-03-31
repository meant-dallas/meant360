import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { toStringRecord } from '@/repositories/base.repository';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const [ptcRaw, evtRaw, settingsRaw] = await Promise.all([
      prisma.eventParticipant.findMany(),
      prisma.event.findMany(),
      prisma.setting.findMany(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRec = (r: any) => toStringRecord(r);
    const participants = ptcRaw.map(toRec);
    const events = evtRaw.map(toRec);
    const settings: Record<string, string> = {};
    for (const row of settingsRaw) settings[row.key] = row.value || '';

    // Build category → logoUrl map from settings
    const categoryLogoMap = new Map<string, string>();
    try {
      const cats: { name: string; email: string; logoUrl?: string }[] = JSON.parse(settings['email_categories'] || '[]');
      for (const c of cats) {
        if (c.logoUrl) categoryLogoMap.set(c.name.toLowerCase().trim(), c.logoUrl);
      }
    } catch { /* ignore */ }

    const eventMap = new Map(events.map((e: Record<string, string>) => [e.id, e]));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

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
          registrationStatus: p.registrationStatus || 'confirmed',
          registeredAt: p.registeredAt || '',
        };
      })
      .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));

    // Upcoming: events with status=Upcoming and date >= today
    const activeParticipations = myParticipations.filter((p) => (p.registrationStatus || 'confirmed') !== 'cancelled');
    const registeredEventIds = new Set(activeParticipations.map((p) => p.eventId));

    const upcoming = events
      .filter((e) => e.status === 'Upcoming' && e.date >= today && e.showOnPortal?.toLowerCase() !== 'false')
      .map((e) => ({
        eventId: e.id,
        eventName: e.name,
        eventDate: e.date,
        description: e.description || '',
        categoryLogoUrl: categoryLogoMap.get((e.category || '').toLowerCase().trim()) || '',
        registrationOpen: e.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
        isRegistered: registeredEventIds.has(e.id)
      }))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    return jsonResponse({ history, upcoming });
  } catch (error) {
    console.error('Portal events error:', error);
    Sentry.captureException(error, { extra: { context: 'Portal events GET' } });
    return errorResponse('Failed to load events', 500, error);
  }
}
