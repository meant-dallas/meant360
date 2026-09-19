import { orgOfficerRepository } from '@/repositories';

// Shared by membership-application.service.ts (new applications) and
// events.service.ts (renewals) so both admin-notification paths resolve
// the Board of Directors recipient list the same way.
export async function getBoDEmails(): Promise<{ email: string; name: string }[]> {
  const officers = await orgOfficerRepository.findAll({ status: 'Active' });
  return officers
    .filter((o) => o.group === 'BoD' && o.email)
    .map((o) => ({ email: o.email, name: o.name }));
}
