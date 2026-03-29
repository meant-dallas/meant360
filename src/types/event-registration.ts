import type { GuestPolicy } from '@/types';

// ========================================
// Shared types for event registration + check-in flows
// ========================================

export type LookupStatus =
  | 'member_active'
  | 'member_expired'
  | 'returning_guest'
  | 'not_found'
  | 'pending_application'
  | 'already_registered'
  | 'already_checked_in'
  | 'already_registered_spouse';

/** Returned to unauthenticated callers — no PII */
export interface PublicLookupResult {
  status: LookupStatus;
  firstName?: string;
  guestPolicy?: GuestPolicy;
  hasExistingRegistration: boolean;
  hasExistingCheckin: boolean;
  pendingMessage?: string;
}

export interface EventRegistrationData {
  participantId: string;
  registeredAdults: number;
  registeredKids: number;
  selectedActivities: string;
  customFields: string;
  attendeeNames: string;
  totalPrice: string;
  paymentStatus: string;
  registrationStatus: string;
  emailConsent: string;
  mediaConsent: string;
}

export interface EventCheckinData {
  checkedInAt: string;
  actualAdults: number;
  actualKids: number;
}

/** Full member profile — only returned to authenticated callers */
export interface MemberProfile {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  homePhone: string;
  cellPhone: string;
  address: string;
  qualifyingDegree: string;
  nativePlace: string;
  college: string;
  jobTitle: string;
  employer: string;
  specialInterests: string;
  spouseName: string;
  spouseEmail: string;
  spousePhone: string;
  children: string;
  membershipType: string;
  membershipLevel: string;
  memberStatus: string;
  payments: string;
  sponsors: string;
  profileComplete: boolean;
  missingFields: string[];
  registrationData?: EventRegistrationData;
  guestPolicy?: GuestPolicy;
}

/** Returned after OTP verification — enough for check-in or guest registration */
export interface OTPVerifiedProfile {
  email: string;
  status: LookupStatus;
  memberId?: string;
  name?: string;
  phone?: string;
  memberStatus?: string;
  membershipType?: string;
  registrationData?: EventRegistrationData;
  guestId?: string;
  city?: string;
  referredBy?: string;
  spouseEmail?: string;
  checkedInAt?: string;
  guestPolicy?: GuestPolicy;
}

export function isGuestBlocked(policy: GuestPolicy | null | undefined): boolean {
  return !policy?.allowGuests || policy.guestAction === 'blocked';
}

export function requiresMembership(policy: GuestPolicy | null | undefined): boolean {
  return policy?.guestAction === 'become_member';
}

export function shouldHideGuestOption(policy: GuestPolicy | null | undefined): boolean {
  return isGuestBlocked(policy) || requiresMembership(policy);
}
