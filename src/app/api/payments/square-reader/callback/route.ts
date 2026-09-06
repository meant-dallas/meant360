import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { completeSquareReaderCheckout } from '@/services/payments.service';
import { parseSquareReaderCallback } from '@/lib/square-reader';
import { getAppUrl } from '@/lib/app-url';
import { logActivity } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

// Square's Point of Sale app redirects the browser here once the checkout
// finishes (or is cancelled) on the staff member's phone. This URL is
// static and pre-registered in Square's Developer Dashboard ("Web callback
// URLs") — Square validates it up front, before the app lets you attempt a
// charge, against a fixed list of exact strings, so it cannot carry a
// per-transaction token in the path or query string. The token instead
// travels via `state` (iOS) / `REQUEST_METADATA` (Android), which Square
// echoes back unchanged — see parseSquareReaderCallback.
//
// There is no user session at this point — the request is authenticated
// only by possession of that random token (crypto.randomUUID(), never
// logged in full to third parties).
export async function GET(request: NextRequest) {
  const base = getAppUrl();
  const { token, transactionId, errorCode } = parseSquareReaderCallback(request.nextUrl.searchParams);

  if (!token) {
    return new NextResponse('Missing correlation token', { status: 400 });
  }

  try {
    const result = await completeSquareReaderCheckout(token, { transactionId, errorCode });

    if (result.status === 'completed') {
      logActivity({
        userEmail: '',
        action: 'create',
        entityType: 'Payment',
        entityId: transactionId || token,
        entityLabel: 'Square Reader payment',
        description: 'Square Reader payment completed via Point of Sale app callback',
      });
    }

    return NextResponse.redirect(
      `${base}/events/${result.eventId}/checkin?readerToken=${encodeURIComponent(token)}`,
    );
  } catch (error) {
    console.error('GET /api/payments/square-reader/callback error:', error);
    Sentry.captureException(error, { extra: { context: 'Square Reader callback', token } });
    return new NextResponse('Failed to finalize Square Reader payment. Please check with staff before leaving.', { status: 500 });
  }
}
