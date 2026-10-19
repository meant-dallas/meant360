import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';
import { jsonResponse, errorResponse, getSessionRole } from '@/lib/api-helpers';
import { setGuestSessionCookie, getGuestSessionEmail, clearGuestSessionCookie } from '@/lib/guest-session';
import { lookupItemsRegistrant } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';
import { sendItemsOtpCode } from '@/lib/items-otp';

const MAX_VERIFY_ATTEMPTS = 5;

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/[eventId]/items-otp
 *
 * Public (rate-limited via middleware). Same 6-digit email-code mechanics as
 * the legacy /api/events/[eventId]/otp route, kept as a separate endpoint so
 * "verify" can return an Items-model-shaped profile (member/guest + existing
 * registration) instead of legacy's EventParticipant-shaped one.
 *
 * Body (send):    { action: 'send',    email: string }
 *   Email always works here for everyone, members included — both pages
 *   show a real Google/Email chooser upfront (see GoogleSignInChooser), so
 *   there's no need to detour a member choosing Email into a separate
 *   sign-in flow.
 * Body (verify):  { action: 'verify',  email: string, code: string }
 *   lookupItemsRegistrant() always widens "find my existing registration" to
 *   the whole household's known emails (member + spouse) now — registration
 *   and check-in use the exact same lookup, no per-flow flag.
 * Body (session): { action: 'session' } — resumes identity from an existing
 *   NextAuth session (already signed into the portal) or a still-valid
 *   guest-session cookie from a recent OTP verify, so a returning visitor
 *   isn't asked to re-verify within the session window.
 * Body (clear):   { action: 'clear' } — the "Not you?" flow: clears this
 *   browser's guest-session cookie. Signed-in NextAuth members are signed
 *   out client-side instead (see ItemsRegisterClient) — this only ever
 *   touches the guest cookie.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'send') return handleSend(body.email, params.eventId);
    if (action === 'verify') return handleVerify(body.email, body.code, params.eventId);
    if (action === 'session') return handleSessionResume(request, params.eventId);
    if (action === 'clear') return handleClear();
    return errorResponse('Invalid action. Use "send", "verify", "session", or "clear".', 400);
  } catch (error) {
    console.error('POST /api/events/[eventId]/items-otp error:', error);
    Sentry.captureException(error, { extra: { context: 'Items event OTP POST' } });
    return errorResponse('OTP request failed', 500, error);
  }
}

async function handleSend(email: unknown, eventId: string) {
  if (!email || typeof email !== 'string') {
    return errorResponse('Email is required', 400);
  }

  const result = await sendItemsOtpCode(email, eventId);
  if (!result.sent) return errorResponse(result.error, result.status);
  return jsonResponse(result);
}

function handleClear() {
  const response = jsonResponse({ cleared: true });
  clearGuestSessionCookie(response);
  return response;
}

async function handleSessionResume(request: NextRequest, eventId: string) {
  const { email: sessionEmail, authenticated } = await getSessionRole();
  const email = (authenticated && sessionEmail) || getGuestSessionEmail(request, eventId);
  if (!email) return errorResponse('No active session', 401);

  try {
    const profile = await lookupItemsRegistrant(eventId, email);
    const response = jsonResponse({ ...profile, email });
    setGuestSessionCookie(response, email, eventId);
    return response;
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    throw error;
  }
}

async function handleVerify(email: unknown, code: unknown, eventId: string) {
  if (!email || typeof email !== 'string') return errorResponse('Email is required', 400);
  if (!code || typeof code !== 'string') return errorResponse('Verification code is required', 400);

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  // Per-email attempt limit, independent of the code's own 10-minute expiry
  // — without this, a still-valid code can be brute-forced with unlimited
  // guesses (see security boundary section, docs/unified-registration-checkin-flow.html).
  const tokenRecord = await prisma.loginToken.findFirst({
    where: { email: normalizedEmail, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!tokenRecord) return errorResponse('Invalid or expired verification code', 400);
  if (tokenRecord.attempts >= MAX_VERIFY_ATTEMPTS) {
    return errorResponse('Too many incorrect attempts — please request a new code.', 429);
  }
  if (tokenRecord.token !== trimmedCode) {
    await prisma.loginToken.update({ where: { id: tokenRecord.id }, data: { attempts: { increment: 1 } } });
    return errorResponse('Invalid or expired verification code', 400);
  }
  await prisma.loginToken.update({ where: { id: tokenRecord.id }, data: { used: true } });

  try {
    const profile = await lookupItemsRegistrant(eventId, normalizedEmail);
    const response = jsonResponse(profile);
    setGuestSessionCookie(response, normalizedEmail, eventId);
    return response;
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    throw error;
  }
}
