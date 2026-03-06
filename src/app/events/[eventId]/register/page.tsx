import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublicDetail } from '@/services/events.service';
import { getPublicSettings } from '@/services/settings.service';
import { NotFoundError } from '@/services/crud.service';
import RegisterClient from './RegisterClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { eventId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const event = await getPublicDetail(params.eventId);
    return {
      title: `Register - ${event.name} | MEANT 360`,
      description: `Register for ${event.name}`,
    };
  } catch {
    return { title: 'Register | MEANT 360' };
  }
}

export default async function RegisterPage({ params }: PageProps) {
  let event;
  try {
    event = await getPublicDetail(params.eventId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const publicSettings = await getPublicSettings();
  const membershipTypes = publicSettings.membershipSettings?.membershipTypes || [];
  const membershipCost = membershipTypes.length > 0 ? membershipTypes[0].price : 0;

  return (
    <RegisterClient
      eventData={{
        id: event.id,
        name: event.name,
        description: event.description,
        date: event.date,
        status: event.status,
        categoryLogoUrl: event.categoryLogoUrl,
        categoryBgColor: event.categoryBgColor,
        pricingRules: event.pricingRules,
        formConfig: event.formConfig,
        activities: event.activities,
        activityPricingMode: event.activityPricingMode,
        guestPolicy: event.guestPolicy,
        registrationOpen: event.registrationOpen,
      }}
      feeSettings={publicSettings.feeSettings}
      membershipCost={membershipCost}
    />
  );
}
