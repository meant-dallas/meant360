import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublicDetail } from '@/services/events.service';
import { getItemsEventPublicDetail } from '@/services/event-items.service';
import { getPublicSettings } from '@/services/settings.service';
import { NotFoundError } from '@/services/crud.service';
import { eventRepository } from '@/repositories';
import CheckinClient from './CheckinClient';
import ItemsCheckinClient from './ItemsCheckinClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { eventId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const event = await getPublicDetail(params.eventId);
    return {
      title: `Check In - ${event.name} | MEANT 360`,
      description: `Check in to ${event.name}`,
    };
  } catch {
    return { title: 'Check In | MEANT 360' };
  }
}

export default async function CheckinPage({ params }: PageProps) {
  const bare = await eventRepository.findById(params.eventId);
  if (!bare) notFound();

  if (bare.registrationModel === 'items') {
    const itemsDetail = await getItemsEventPublicDetail(params.eventId);
    return <ItemsCheckinClient eventId={params.eventId} event={itemsDetail.event} />;
  }

  let event;
  try {
    event = await getPublicDetail(params.eventId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const publicSettings = await getPublicSettings();

  return (
    <CheckinClient
      eventData={{
        id: event.id,
        name: event.name,
        description: event.description,
        date: event.date,
        status: event.status,
        categoryLogoUrl: event.categoryLogoUrl,
        categoryBgColor: event.categoryBgColor,
        pricingRules: event.pricingRules,
        guestPolicy: event.guestPolicy,
        capacityMode: event.capacityMode,
        activities: event.activities,
        activityPricingMode: event.activityPricingMode,
      }}
      feeSettings={publicSettings.feeSettings}
    />
  );
}
