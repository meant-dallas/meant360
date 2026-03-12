import { Metadata } from 'next';
import { getPublicSettings } from '@/services/settings.service';
import MembershipRenewClient from './MembershipRenewClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Renew Membership | MEANT 360',
  description: 'Renew your membership in the Malayalee Engineers\' Association of North Texas',
};

export default async function MembershipRenewPage() {
  const publicSettings = await getPublicSettings();

  return (
    <MembershipRenewClient
      membershipTypes={publicSettings.membershipSettings?.membershipTypes || []}
      feeSettings={publicSettings.feeSettings}
    />
  );
}
