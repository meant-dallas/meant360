import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, validateBody, getSessionRole } from '@/lib/api-helpers';
import { lookupSchema } from '@/types/schemas';
import { lookup } from '@/services/events.service';
import type { PublicLookupResult } from '@/types/event-registration';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const body = await request.json();
    const validated = await validateBody(lookupSchema, body);
    if (validated instanceof NextResponse) return validated;

    const result = await lookup(params.eventId, validated.email);

    // Get session role (won't throw if unauthenticated)
    const { role, email: sessionEmail, authenticated } = await getSessionRole();

    // Full PII is returned for:
    // 1. Admin or committee (any email)
    // 2. Any authenticated user whose session email matches the lookup email
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    const isOwner =
      authenticated &&
      sessionEmail?.toLowerCase() === validated.email.toLowerCase();

    if (isAdminOrCommittee || isOwner) {
      return jsonResponse(result);
    }

    // For unauthenticated / non-owner callers: strip PII
    const fullResult = result as Record<string, unknown>;
    const firstName = typeof fullResult.name === 'string'
      ? fullResult.name.split(' ')[0]
      : undefined;

    const publicResult: PublicLookupResult = {
      status: (fullResult.status as PublicLookupResult['status']) || 'not_found',
      firstName,
      guestPolicy: fullResult.guestPolicy as PublicLookupResult['guestPolicy'],
      hasExistingRegistration: !!(fullResult.registrationData),
      hasExistingCheckin: fullResult.status === 'already_checked_in',
      pendingMessage:
        fullResult.status === 'pending_application'
          ? (fullResult.message as string | undefined)
          : undefined,
    };

    return jsonResponse(publicResult);
  } catch (error) {
    console.error('POST /api/events/[eventId]/lookup error:', error);
    Sentry.captureException(error, { extra: { context: 'Event lookup POST' } });
    return errorResponse('Lookup failed', 500, error);
  }
}
