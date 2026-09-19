import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

// Short-lived, signed proof that an unauthenticated guest verified control of
// `email` for one specific event via OTP. Issued once right after OTP
// verification and reused for the rest of that browsing session (view, edit,
// cancel) instead of re-passing and re-consuming the one-time code per
// request — a single-use code that's already been spent verifying the guest
// once has no business also gating every later action, which is what caused
// guests to get "Unauthorized" on a second action or after the code's short
// expiry window passed.
//
// Deliberately not a NextAuth session: this never grants portal/member
// access, only "this browser recently proved it controls this email for
// this one event." Signed (not just opaque) so it can't be forged or
// replayed for a different email/event without the server's secret.

const COOKIE_NAME = 'event_guest_session';
// 2 hours — long enough that filling out a multi-entry Activity registration
// (several performances, each with named participants and questions) doesn't
// risk expiring mid-flow and hitting a 401 right as the registrant is about
// to pay. Session resume (see getGuestSessionEmail) also re-issues a fresh
// cookie on every page load, so an active registrant's window keeps sliding
// forward in practice.
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

function signingKey(): string {
  // Domain-separated from NEXTAUTH_SECRET's other uses (real login sessions)
  // rather than sharing the raw secret directly.
  return crypto.createHash('sha256').update(`guest-session:${process.env.NEXTAUTH_SECRET || ''}`).digest('hex');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Set the guest-session cookie on a response after a successful OTP verification. */
export function setGuestSessionCookie(response: NextResponse, email: string, eventId: string): void {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${email.toLowerCase()}|${eventId}|${expiresAt}`;
  const token = `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS / 1000,
    path: '/',
  });
}

/**
 * Clear the guest-session cookie — lets a guest explicitly back out of a
 * verified identity ("Not you?") instead of waiting out the 60-minute
 * window. httpOnly, so this can only happen via a server round-trip, not
 * client-side document.cookie.
 */
export function clearGuestSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/** Whether the request carries a still-valid guest session for exactly this email + event. */
export function hasValidGuestSession(request: NextRequest, email: string, eventId: string): boolean {
  const decoded = decodeGuestSession(request);
  if (!decoded) return false;
  if (decoded.email !== email.toLowerCase()) return false;
  if (decoded.eventId !== eventId) return false;
  return true;
}

function decodeGuestSession(request: NextRequest): { email: string; eventId: string } | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!timingSafeEqual(signature, sign(payload))) return null;

  const [cookieEmail, cookieEventId, expiresAtStr] = payload.split('|');
  const expiresAt = Number(expiresAtStr);
  if (!cookieEmail || !cookieEventId || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;
  return { email: cookieEmail, eventId: cookieEventId };
}

/**
 * Resume an already-verified guest session for this event without asking
 * for OTP again — used on page load so navigating between register/check-in
 * (or just refreshing) within the session window doesn't force a re-verify.
 */
export function getGuestSessionEmail(request: NextRequest, eventId: string): string | null {
  const decoded = decodeGuestSession(request);
  if (!decoded || decoded.eventId !== eventId) return null;
  return decoded.email;
}
