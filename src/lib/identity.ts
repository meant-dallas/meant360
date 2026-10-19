import { prisma } from '@/lib/db';
import { memberSpouseRepository } from '@/repositories';

export type IdentityKind = 'admin' | 'committee' | 'member' | 'guest';

export interface ResolvedIdentity {
  email: string;
  kind: IdentityKind;
  memberId: string | null;
  /** The signed-in person's own name — the primary Member row's name, or the matched MemberSpouse row's own name when the email matched there instead. */
  memberName?: string;
  /** First name only, same person as `memberName` — split out for greetings so callers don't need to parse `memberName` themselves. */
  firstName?: string;
  /**
   * The household's primary Member record's name, always — equal to
   * `memberName` when the match came directly off the Member row, but
   * distinct from it when a spouse's own email was the match. Callers that
   * build a "pull family from profile" list need this to know whether to
   * offer the primary member's name back (the signed-in spouse's own name
   * obviously shouldn't be offered to themselves).
   */
  primaryMemberName?: string;
  membershipStatus?: string;
  currentMembershipLevel?: string;
}

/**
 * Single source of truth for "who is this email" — one live query against
 * OrgOfficer + Member + MemberSpouse, replacing three independent inline
 * lookups that previously answered the same question in auth.ts and
 * event-items.service.ts. Deliberately uncached (unlike auth.ts's old
 * 5-minute bulk-map cache) — membership status must be re-evaluated fresh
 * every time (see docs/unified-registration-checkin-flow.html), and a
 * member who just renewed shouldn't see a stale "requires renewal" for up
 * to 5 minutes afterward.
 */
export async function resolveIdentity(email: string): Promise<ResolvedIdentity> {
  const emailLower = email.trim().toLowerCase();

  const [officer, member] = await Promise.all([
    prisma.orgOfficer.findFirst({
      where: { email: { equals: emailLower, mode: 'insensitive' }, status: 'Active' },
    }),
    prisma.member.findFirst({
      where: {
        OR: [
          { email: { equals: emailLower, mode: 'insensitive' } },
          { loginEmail: { equals: emailLower, mode: 'insensitive' } },
        ],
      },
    }),
  ]);

  const portalRole = (officer?.portalRole || '').trim().toLowerCase();
  if (portalRole === 'admin' || portalRole === 'committee') {
    const primaryName = member ? `${member.firstName || ''} ${member.lastName || ''}`.trim() || undefined : undefined;
    return {
      email: emailLower,
      kind: portalRole,
      memberId: member?.id ?? null,
      memberName: primaryName,
      firstName: member?.firstName || undefined,
      primaryMemberName: primaryName,
      membershipStatus: member?.status || undefined,
      currentMembershipLevel: member?.membershipLevel || undefined,
    };
  }

  if (member) {
    const primaryName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || undefined;
    return {
      email: emailLower,
      kind: 'member',
      memberId: member.id,
      memberName: primaryName,
      firstName: member.firstName || undefined,
      primaryMemberName: primaryName,
      membershipStatus: member.status || undefined,
      currentMembershipLevel: member.membershipLevel || undefined,
    };
  }

  // Not found on the Member row itself — a spouse's own email lives only on
  // MemberSpouse, so a spouse signing in under their own email would
  // otherwise be treated as a guest despite being real family.
  const spouse = await prisma.memberSpouse.findFirst({
    where: { email: { equals: emailLower, mode: 'insensitive' } },
    include: { member: true },
  });
  if (spouse) {
    return {
      email: emailLower,
      kind: 'member',
      memberId: spouse.memberId,
      memberName: `${spouse.firstName || ''} ${spouse.lastName || ''}`.trim() || undefined,
      firstName: spouse.firstName || undefined,
      primaryMemberName: `${spouse.member.firstName || ''} ${spouse.member.lastName || ''}`.trim() || undefined,
      membershipStatus: spouse.member.status || undefined,
      currentMembershipLevel: spouse.member.membershipLevel || undefined,
    };
  }

  return { email: emailLower, kind: 'guest', memberId: null };
}

/**
 * Member email + loginEmail + every spouse email for a memberId — the one
 * definition of "household" shared by lookupItemsRegistrant's widened
 * registration search and isRegistrationOwnerOrStaff's write-ownership
 * check, so "find the registration" and "may this caller act on it" never
 * drift apart (previously a spouse could find a registration filed under
 * the other spouse's email but fail the exact-match ownership check on
 * write routes).
 */
export async function resolveHouseholdEmails(memberId: string): Promise<string[]> {
  const [member, spouses] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId } }),
    memberSpouseRepository.findByMemberId(memberId),
  ]);
  const emails = new Set<string>();
  if (member?.email) emails.add(member.email.toLowerCase().trim());
  if (member?.loginEmail) emails.add(member.loginEmail.toLowerCase().trim());
  for (const sp of spouses) {
    const spouseEmail = (sp.email || '').toLowerCase().trim();
    if (spouseEmail) emails.add(spouseEmail);
  }
  return Array.from(emails);
}
