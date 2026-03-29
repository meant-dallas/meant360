import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, getSessionRole } from '@/lib/api-helpers';
import { lookup } from '@/services/events.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events/[eventId]/my-profile
 *
 * Requires an authenticated session (any role).
 * Returns the full member/guest profile for the session's email
 * combined with any existing event registration/check-in data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const { email, authenticated } = await getSessionRole();

  if (!authenticated || !email) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const result = await lookup(params.eventId, email);

    if (!result || result.status === 'not_found') {
      return errorResponse('No profile found for this account', 404);
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('GET /api/events/[eventId]/my-profile error:', error);
    Sentry.captureException(error, { extra: { context: 'my-profile GET' } });
    return errorResponse('Failed to load profile', 500, error);
  }
}
