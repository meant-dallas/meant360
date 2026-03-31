import type { PublicLookupResult, MemberProfile, OTPVerifiedProfile } from '@/types/event-registration';

// ========================================
// Shared API client helpers for event registration + check-in flows
// ========================================

export async function lookupByEmail(eventId: string, email: string): Promise<PublicLookupResult> {
  const res = await fetch(`/api/events/${eventId}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Lookup failed');
  return json.data;
}

export async function loadMyProfile(eventId: string): Promise<MemberProfile> {
  const res = await fetch(`/api/events/${eventId}/my-profile`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load profile');
  return json.data;
}

export async function sendCheckinOTP(eventId: string, email: string): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send', email }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to send verification code');
}

export async function verifyCheckinOTP(eventId: string, email: string, code: string): Promise<OTPVerifiedProfile> {
  const res = await fetch(`/api/events/${eventId}/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', email, code }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Invalid or expired code');
  return json.data;
}
