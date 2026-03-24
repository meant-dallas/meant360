import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return Response.json({ success: false, error: 'Email and code are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const loginToken = await prisma.loginToken.findFirst({
      where: {
        email: normalizedEmail,
        token: code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!loginToken) {
      return Response.json({ success: false, error: 'Invalid or expired code' }, { status: 400 });
    }

    // Mark token as used
    await prisma.loginToken.update({
      where: { id: loginToken.id },
      data: { used: true },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/membership-applications/verify-otp error:', error);
    Sentry.captureException(error, { extra: { context: 'Membership application verify OTP' } });
    return Response.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}
