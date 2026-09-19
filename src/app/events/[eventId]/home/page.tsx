import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublicDetail } from '@/services/events.service';
import { getItemsEventHomeDetail } from '@/services/event-items.service';
import { getPublicSettings } from '@/services/settings.service';
import { getPublicSponsors } from '@/services/sponsors.service';
import { NotFoundError } from '@/services/crud.service';
import { eventRepository } from '@/repositories';
import type { SocialLinks, PublicSponsor } from '@/types';
import EventHomeClient from './EventHomeClient';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { eventId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const event = await getPublicDetail(params.eventId);
    return {
      title: `${event.name} | MEANT 360`,
      description: `${event.name} - Hosted by MEANT`,
    };
  } catch {
    return { title: 'Event | MEANT 360' };
  }
}

export default async function EventHomePage({ params }: PageProps) {
  const bare = await eventRepository.findById(params.eventId);
  if (!bare) notFound();

  let event;
  try {
    event = bare.registrationModel === 'items'
      ? await getItemsEventHomeDetail(params.eventId)
      : await getPublicDetail(params.eventId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const publicSettings = await getPublicSettings();
  const links = publicSettings.socialLinks;
  const hasAny = Object.values(links).some((v) => v);
  const socialLinks: SocialLinks | null = hasAny ? links : null;

  // A sponsor-lookup failure must never take down the whole public event
  // page — fall back to showing no sponsors rather than a 500.
  let sponsors: { eventSponsors: PublicSponsor[]; generalSponsors: PublicSponsor[] } = { eventSponsors: [], generalSponsors: [] };
  try {
    const eventYear = event.date ? event.date.slice(0, 4) : undefined;
    sponsors = await getPublicSponsors({ eventId: params.eventId, year: eventYear });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Sponsor lookup failed on event home page', eventId: params.eventId } });
  }

  return <EventHomeClient event={event} socialLinks={socialLinks} sponsors={sponsors} />;
}
