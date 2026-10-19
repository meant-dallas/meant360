import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import * as Sentry from '@sentry/nextjs';
import { authOptions, isAdmin } from './auth';
import { isBoDMember } from '@/services/membership-application.service';
import { getGuestSessionEmail } from './guest-session';
import { resolveIdentity, resolveHouseholdEmails } from './identity';
import type { UserRole, ApiResponse } from '@/types';
import { type ZodType, type ZodTypeDef, ZodError } from 'zod';

// ========================================
// API Route Helpers
// ========================================

export function jsonResponse<T>(data: T, status = 200): NextResponse {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

export function errorResponse(message: string, status = 400, error?: unknown): NextResponse {
  if (status >= 500 && error) {
    Sentry.captureException(error, { extra: { message } });
  }
  const body: ApiResponse = { success: false, error: message };
  return NextResponse.json(body, { status });
}

/**
 * Validate a request body against a Zod schema.
 * Returns parsed data on success or a NextResponse error on failure.
 */
export async function validateBody<Output, Def extends ZodTypeDef, Input>(
  schema: ZodType<Output, Def, Input>,
  body: unknown,
): Promise<Output | NextResponse> {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return errorResponse(`Validation error: ${messages}`, 400);
    }
    return errorResponse('Invalid request body', 400);
  }
}

export async function getSessionRole(): Promise<{
  role: UserRole | null;
  email: string;
  memberId: string | null;
  authenticated: boolean;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { role: null, email: '', memberId: null, authenticated: false };
  }
  const role = (session.user as Record<string, unknown>).role as UserRole | null ?? null;
  const memberId = (session.user as Record<string, unknown>).memberId as string | null ?? null;
  return { role, email: session.user.email, memberId, authenticated: true };
}

export async function requireAuth(): Promise<
  { role: UserRole; email: string } | NextResponse
> {
  const { role, email, authenticated } = await getSessionRole();
  if (!authenticated) {
    return errorResponse('Unauthorized', 401);
  }
  if (role !== 'admin' && role !== 'committee') {
    return errorResponse('Forbidden: access denied', 403);
  }
  return { role, email };
}

export async function requireAdmin(): Promise<
  { role: UserRole; email: string } | NextResponse
> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (!isAdmin(result.role)) {
    return errorResponse('Forbidden: insufficient permissions', 403);
  }
  return result;
}

/**
 * Board of Directors only — distinct from the admin/committee portal role.
 * BoD is tracked as a group on the OrgOfficer table (same source
 * requireBoDMember in membership-application.service.ts uses for
 * approve/reject), not the session's admin/committee role, so this needs
 * its own DB check beyond requireAuth().
 */
export async function requireBoD(): Promise<
  { role: UserRole; email: string } | NextResponse
> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (!(await isBoDMember(result.email))) {
    return errorResponse('Forbidden: Board of Directors only', 403);
  }
  return result;
}

export async function requireCommitteeOrAdmin(): Promise<
  { role: UserRole; email: string } | NextResponse
> {
  return requireAuth();
}

/**
 * Whether the caller may manage (edit/cancel/check in) an items-model
 * registration — either staff (admin/committee), or the registrant
 * themselves proven via the OTP-verified guest-session cookie set for this
 * exact event (see src/lib/guest-session.ts). Household-aware: the verified
 * email doesn't need to be the exact contactEmail on the registration, only
 * in the same household (member + loginEmail + spouse emails, via
 * resolveHouseholdEmails) — e.g. a spouse who verifies with their own email
 * can act on a registration their partner filed under a different email.
 * This mirrors lookupItemsRegistrant's household-widened search, so "find
 * the registration" and "may this caller act on it" use the same
 * definition of household rather than drifting apart.
 */
export async function isRegistrationOwnerOrStaff(request: NextRequest, eventId: string, contactEmail: string): Promise<boolean> {
  const { role, authenticated } = await getSessionRole();
  if (authenticated && (role === 'admin' || role === 'committee')) return true;

  const verifiedEmail = getGuestSessionEmail(request, eventId);
  if (!verifiedEmail) return false;

  const contactEmailLower = contactEmail.toLowerCase().trim();
  if (verifiedEmail === contactEmailLower) return true;

  const identity = await resolveIdentity(verifiedEmail);
  if (!identity.memberId) return false;
  const householdEmails = await resolveHouseholdEmails(identity.memberId);
  return householdEmails.includes(contactEmailLower);
}

export async function requireMember(): Promise<
  { role: UserRole; email: string; memberId: string } | NextResponse
> {
  const { role, email, memberId, authenticated } = await getSessionRole();
  if (!authenticated) {
    return errorResponse('Unauthorized', 401);
  }
  if (!role) {
    return errorResponse('Forbidden: access denied', 403);
  }
  if (!memberId) {
    return errorResponse('No member profile found', 403);
  }
  return { role, email, memberId };
}

/**
 * Verify and consume a one-time event OTP code for the given email — used to
 * authorize unauthenticated guests (no NextAuth session) for actions on their
 * own registration, mirroring the check already done for guest registration
 * creation. Returns false (and leaves the token untouched) if missing/invalid/
 * expired/already used.
 */
export async function verifyAndConsumeOtpToken(email: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const { prisma } = await import('@/lib/db');
  const tokenRecord = await prisma.loginToken.findFirst({
    where: {
      email: email.toLowerCase(),
      token,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });
  if (!tokenRecord) return false;
  await prisma.loginToken.update({ where: { id: tokenRecord.id }, data: { used: true } });
  return true;
}
