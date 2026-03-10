import { Metadata } from 'next';
import { getPublicSettings } from '@/services/settings.service';
import MembershipApplyClient from './MembershipApplyClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Apply for Membership | MEANT 360',
  description: 'Apply for membership in the Malayalee Engineers\' Association of North Texas',
};

export default async function MembershipApplyPage() {
  const publicSettings = await getPublicSettings();

  return (
    <MembershipApplyClient
      membershipTypes={publicSettings.membershipSettings?.membershipTypes || []}
      feeSettings={publicSettings.feeSettings}
    />
  );
}
