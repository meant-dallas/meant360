import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/services/email.service';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { lookup } from '@/services/events.service';
import type { OTPVerifiedProfile } from '@/types/event-registration';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events/[eventId]/otp
 *
 * Public (rate-limited via middleware).
 *
 * Body (send):   { action: 'send',   email: string }
 * Body (verify): { action: 'verify', email: string, code: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'send') {
      return handleSend(body.email, params.eventId);
    }

    if (action === 'verify') {
      return handleVerify(body.email, body.code, params.eventId);
    }

    return errorResponse('Invalid action. Use "send" or "verify".', 400);
  } catch (error) {
    console.error('POST /api/events/[eventId]/otp error:', error);
    Sentry.captureException(error, { extra: { context: 'Event OTP POST' } });
    return errorResponse('OTP request failed', 500, error);
  }
}

async function handleSend(email: unknown, _eventId: string) {
  if (!email || typeof email !== 'string') {
    return errorResponse('Email is required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return errorResponse('Invalid email address', 400);
  }

  // Generate 6-digit code
  const token = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate existing unused tokens for this email
  const existingTokens = await prisma.loginToken.findMany({
    where: { email: normalizedEmail, used: false },
    select: { id: true },
  });
  for (const t of existingTokens) {
    await prisma.loginToken.update({ where: { id: t.id }, data: { used: true } });
  }

  // Store new token
  await prisma.loginToken.create({
    data: { email: normalizedEmail, token, expiresAt },
  });

  // Send verification email
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
        <p style="color: #94a3b8; font-size: 14px;">This code expires in 10 minutes. If you didn&apos;t request this, you can safely ignore this email.</p>
      </div>
    `,
    'system@meant360.org',
  );

  if (!emailResult.success) {
    console.error('Event OTP email send failed:', emailResult.error);
    Sentry.captureMessage('Event OTP email send failed', {
      level: 'error',
      extra: { error: emailResult.error },
    });
    return errorResponse('Failed to send verification code', 500);
  }

  return jsonResponse({ sent: true });
}

async function handleVerify(email: unknown, code: unknown, eventId: string) {
  if (!email || typeof email !== 'string') {
    return errorResponse('Email is required', 400);
  }
  if (!code || typeof code !== 'string') {
    return errorResponse('Verification code is required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  // Find valid (unused, not expired) token
  const tokenRecord = await prisma.loginToken.findFirst({
    where: {
      email: normalizedEmail,
      token: trimmedCode,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!tokenRecord) {
    return errorResponse('Invalid or expired verification code', 400);
  }

  // Do NOT mark token as used here — the registration API will consume it.
  // This allows the verified code to be passed along with the registration payload.

  // Run lookup to get profile data
  const lookupResult = await lookup(eventId, normalizedEmail);
  const full = lookupResult as Record<string, unknown>;

  // Build OTPVerifiedProfile — limited fields, no excess PII beyond what's needed
  const profile: OTPVerifiedProfile = {
    email: normalizedEmail,
    status: (full.status as OTPVerifiedProfile['status']) || 'not_found',
    memberId: full.memberId as string | undefined,
    name: full.name as string | undefined,
    phone: full.phone as string | undefined,
    memberStatus: full.memberStatus as string | undefined,
    membershipType: full.membershipType as string | undefined,
    registrationData: full.registrationData as OTPVerifiedProfile['registrationData'],
    guestId: full.guestId as string | undefined,
    city: full.city as string | undefined,
    referredBy: full.referredBy as string | undefined,
    spouseEmail: full.spouseEmail as string | undefined,
    checkedInAt: full.checkedInAt as string | undefined,
    guestPolicy: full.guestPolicy as OTPVerifiedProfile['guestPolicy'],
  };

  return jsonResponse(profile);
}
