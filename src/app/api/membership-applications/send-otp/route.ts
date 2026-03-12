import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/services/email.service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
  
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return Response.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    // Check if this email is already a member
    const existingMember = await prisma.member.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: 'insensitive' } },
          { loginEmail: { equals: normalizedEmail, mode: 'insensitive' } },
        ],
      },
    });

    if (existingMember) {
      return Response.json({
        success: false,
        error: 'This email is already associated with an existing member. Please use the member portal to manage your membership.',
      }, { status: 400 });
    }

    // Check if there's already a pending application with this email
    const existingApplication = await prisma.membershipApplication.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        status: 'Pending',
      },
    });

    if (existingApplication) {
      return Response.json({
        success: false,
        error: 'A membership application with this email is already pending review. Please wait for the Board of Directors to process your existing application before submitting a new one.',
      }, { status: 400 });
    }

    // Generate 6-digit token
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

    // Store the token
    await prisma.loginToken.create({
      data: { email: normalizedEmail, token, expiresAt },
    });

    // Send verification email
    const emailResult = await sendEmail(
      [normalizedEmail],
      'MEANT 360 — Verify Your Email',
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Verify Your Email</h2>
          <p style="color: #64748b;">Enter this code to continue with your membership application:</p>
          <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${token}</span>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      'system@meant360.org',
    );

    if (!emailResult.success) {
      console.error('Membership OTP email send failed:', emailResult.error);
      return Response.json({ success: false, error: 'Failed to send verification code' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/membership-applications/send-otp error:', error);
    return Response.json({ success: false, error: 'Failed to send verification code' }, { status: 500 });
  }
}
