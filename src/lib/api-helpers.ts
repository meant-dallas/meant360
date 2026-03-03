import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import * as Sentry from '@sentry/nextjs';
import { authOptions, isAdmin } from './auth';
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

export async function requireCommitteeOrAdmin(): Promise<
  { role: UserRole; email: string } | NextResponse
> {
  return requireAuth();
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
