import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { completeSquareReaderCheckout } from '@/services/payments.service';
import { parseSquareReaderCallback } from '@/lib/square-reader';
import { getAppUrl } from '@/lib/app-url';
import { logActivity } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

// Square's Point of Sale app redirects the browser here once the checkout
// finishes (or is cancelled) on the staff member's phone, appending its own
// result params (iOS: `data`, Android: `com.squareup.pos.*`) to whatever
// callback_url we gave it. The token lives in the PATH, not the query
// string, specifically so we don't have to trust that Square appends its
// params with `&` rather than a second `?` on a URL that already has one.
//
// There is no user session at this point — the request is authenticated
// only by possession of the random `token` (crypto.randomUUID(), never
// logged in full to third parties).
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  const base = getAppUrl();

  if (!token) {
    return new NextResponse('Missing token', { status: 400 });
  }

  try {
    const { transactionId, errorCode } = parseSquareReaderCallback(request.nextUrl.searchParams);
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
