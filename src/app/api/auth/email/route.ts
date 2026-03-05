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

    // Check if email belongs to a registered member or committee member
    const [member, committeeMember] = await Promise.all([
      prisma.member.findFirst({
        where: {
          OR: [
            { email: normalizedEmail },
            { loginEmail: normalizedEmail },
          ],
        },
      }),
      prisma.committeeMember.findUnique({
        where: { email: normalizedEmail },
      }),
    ]);

    if (!member && !committeeMember) {
      // Don't reveal whether the email exists — always show success
      return Response.json({ success: true });
    }

    // Generate 6-digit token
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any existing unused tokens for this email
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

    // Send OTP email
    const name = member
      ? `${member.firstName || ''} ${member.lastName || ''}`.trim()
      : committeeMember?.name || '';

    const emailResult = await sendEmail(
      [normalizedEmail],
      'Your MEANT 360 Login Code',
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Sign in to MEANT 360</h2>
          ${name ? `<p style="color: #64748b;">Hi ${name},</p>` : ''}
          <p style="color: #64748b;">Your one-time login code is:</p>
          <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${token}</span>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      'system@meant360.org',
    );

    if (!emailResult.success) {
      console.error('OTP email send failed:', emailResult.error);
      return Response.json({ success: false, error: 'Failed to send login code' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/auth/email error:', error);
    return Response.json({ success: false, error: 'Failed to send login code' }, { status: 500 });
  }
}
