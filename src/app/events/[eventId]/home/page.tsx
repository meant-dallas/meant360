import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublicDetail } from '@/services/events.service';
import { getPublicSettings } from '@/services/settings.service';
import { NotFoundError } from '@/services/crud.service';
import type { SocialLinks } from '@/types';
import EventHomeClient from './EventHomeClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { eventId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const event = await getPublicDetail(params.eventId);
    return {
      title: `${event.name} | MEANT 360`,
      description: event.description || `${event.name} - Hosted by MEANT`,
    };
  } catch {
    return { title: 'Event | MEANT 360' };
  }
}

export default async function EventHomePage({ params }: PageProps) {
  let event;
  try {
    event = await getPublicDetail(params.eventId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const publicSettings = await getPublicSettings();
  const links = publicSettings.socialLinks;
  const hasAny = Object.values(links).some((v) => v);
  const socialLinks: SocialLinks | null = hasAny ? links : null;

  return <EventHomeClient event={event} socialLinks={socialLinks} />;
}
