import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/services/email.service';
import { jsonResponse, errorResponse, verifyAndConsumeOtpToken, getSessionRole } from '@/lib/api-helpers';
import { setGuestSessionCookie, getGuestSessionEmail, clearGuestSessionCookie } from '@/lib/guest-session';
import { lookupItemsRegistrant, checkMemberOrSpouseIdentity } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/[eventId]/items-otp
 *
 * Public (rate-limited via middleware). Same 6-digit email-code mechanics as
 * the legacy /api/events/[eventId]/otp route, kept as a separate endpoint so
 * "verify" can return an Items-model-shaped profile (member/guest + existing
 * registration) instead of legacy's EventParticipant-shaped one.
 *
 * Body (send):    { action: 'send',    email: string, skipMemberCheck?: boolean }
 *   skipMemberCheck: true is for check-in only (see ItemsCheckinClient) —
 *   members/guests alike may always use OTP there even if not signed in.
 *   Registration omits it, so a member/spouse email gets routed to real
 *   sign-in instead of a code (see handleSend).
 * Body (verify):  { action: 'verify',  email: string, code: string }
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

    if (action === 'send') return handleSend(body.email, body.skipMemberCheck === true);
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

async function handleSend(email: unknown, skipMemberCheck: boolean) {
  if (!email || typeof email !== 'string') {
    return errorResponse('Email is required', 400);
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return errorResponse('Invalid email address', 400);
  }

  // Registration: a member/spouse email doesn't get a code at all — they're
  // routed to real sign-in instead (see SignInRequiredStep in the client).
  // Check-in intentionally opts out via skipMemberCheck — staff need to be
  // able to check anyone in by OTP without requiring a portal sign-in.
  if (!skipMemberCheck) {
    const identity = await checkMemberOrSpouseIdentity(normalizedEmail);
    if (identity.isMemberOrSpouse) {
      return jsonResponse({ sent: false, requiresSignIn: true, firstName: identity.firstName });
    }
  }

  const token = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const existingTokens = await prisma.loginToken.findMany({
    where: { email: normalizedEmail, used: false },
    select: { id: true },
  });
  for (const t of existingTokens) {
    await prisma.loginToken.update({ where: { id: t.id }, data: { used: true } });
  }

  await prisma.loginToken.create({ data: { email: normalizedEmail, token, expiresAt } });

  const emailResult = await sendEmail(
    [normalizedEmail],
    'MEANT 360 — Event Verification Code',
    `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e293b; margin-bottom: 8px;">Your Verification Code</h2>
        <p style="color: #64748b;">Enter this code to continue with your event registration or check-in:</p>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${token}</span>
        </div>
        <p style="color: #94a3b8; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    'system',
  );

  if (!emailResult.success) {
    console.error('Items event OTP email send failed:', emailResult.error);
    Sentry.captureMessage('Items event OTP email send failed', { level: 'error', extra: { error: emailResult.error } });
    return errorResponse('Failed to send verification code', 500);
  }

  return jsonResponse({ sent: true });
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
  const verified = await verifyAndConsumeOtpToken(normalizedEmail, code.trim());
  if (!verified) return errorResponse('Invalid or expired verification code', 400);

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
