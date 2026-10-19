import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/services/email.service';
import { checkMemberOrSpouseIdentity, requireItemsEvent } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';
import { parseItemCatalog, isAllowedGuestEmail } from '@/lib/event-config';

// Per-email OTP hardening, independent of middleware's generic per-IP rate
// limit (that one doesn't stop a distributed attempt against one specific
// email). See docs/unified-registration-checkin-flow.html's security
// boundary section.
const RESEND_COOLDOWN_MS = 60 * 1000;

export type SendItemsOtpResult =
  | { sent: true }
  | { sent: false; error: string; status: number };

/**
 * Core "send an items-model event OTP code" logic — shared by the
 * items-otp API route (manual Email chooser) and auth.ts's signIn callback
 * (the Google-fallback auto-send for an unrecognized Google account, see
 * docs/unified-registration-checkin-flow.html). Both entry points must run
 * the exact same guest-policy/domain gate — having only one of them call
 * requireItemsEvent() was the root cause of a fail-open gap fixed earlier
 * in this effort.
 *
 * Email always works here for everyone, members included — now that both
 * pages show a real Google/Email chooser upfront (see
 * GoogleSignInChooser), there's no need to detour a member choosing Email
 * into a separate sign-in flow; lookupItemsRegistrant() still resolves them
 * as a member by email after verification, so member pricing/status is
 * unaffected either way.
 */
export async function sendItemsOtpCode(
  email: string,
  eventId: string,
  opts: { bypassResendCooldown?: boolean } = {},
): Promise<SendItemsOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { sent: false, error: 'Invalid email address', status: 400 };
  }

  // The guest-domain restriction further down must never apply to members,
  // only to the allowGuests path.
  const identity = await checkMemberOrSpouseIdentity(normalizedEmail);

  if (!identity.isMemberOrSpouse) {
    // requireItemsEvent throws NotFoundError for a missing/wrong-model/
    // deleted event instead of silently skipping the guest-policy check
    // below.
    let catalog: ReturnType<typeof parseItemCatalog>;
    try {
      const event = await requireItemsEvent(eventId);
      catalog = parseItemCatalog(event.items);
    } catch (error) {
      if (error instanceof NotFoundError) return { sent: false, error: error.message, status: 404 };
      throw error;
    }
    // Applies to check-in too, not just registration — an event with guest
    // registration off shouldn't let a non-member walk in and self-check-in
    // at the door either.
    if (!catalog.allowGuests) {
      return { sent: false, error: 'This event is open to verified members only.', status: 403 };
    }
    const allowedDomains = catalog.allowedGuestEmailDomains;
    if (allowedDomains?.length && !isAllowedGuestEmail(normalizedEmail, allowedDomains)) {
      return { sent: false, error: `This event only accepts guest registrations from ${allowedDomains.join(', ')} email addresses.`, status: 403 };
    }
  }

  if (!opts.bypassResendCooldown) {
    const recentlySent = await prisma.loginToken.findFirst({
      where: { email: normalizedEmail, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recentlySent) {
      return { sent: false, error: 'A code was already sent — please wait a moment before requesting another.', status: 429 };
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
    return { sent: false, error: 'Failed to send verification code', status: 500 };
  }

  return { sent: true };
}
