'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Reads the one-time `verifyEmail` query param left by the NextAuth
 * Google-fallback redirect (see auth.ts's `signIn` callback) — reached when
 * someone clicks "Sign in with Google" on an items-model register/check-in
 * page but their Google account doesn't resolve to a known member. An OTP
 * for this email was already sent server-side as part of that redirect, so
 * the caller should jump straight to code entry instead of re-sending.
 */
export function useGoogleFallbackEmail(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get('verifyEmail');
}
