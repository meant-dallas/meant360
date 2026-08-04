import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { eventPaymentConfigSchema } from '@/types/schemas';
import { getEventPaymentConfig, setEventPaymentConfig } from '@/services/settings.service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const config = await getEventPaymentConfig(params.eventId);
    return jsonResponse(config);
  } catch (error) {
    console.error('GET /api/events/[eventId]/payment-config error:', error);
    Sentry.captureException(error, { extra: { context: 'Event payment-config GET', eventId: params.eventId } });
    return errorResponse('Failed to fetch payment config', 500, error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(eventPaymentConfigSchema, body);
    if (validated instanceof NextResponse) return validated;

    await setEventPaymentConfig(params.eventId, validated, auth.email);
    return jsonResponse(validated);
  } catch (error) {
    console.error('PUT /api/events/[eventId]/payment-config error:', error);
    Sentry.captureException(error, { extra: { context: 'Event payment-config PUT', eventId: params.eventId } });
    return errorResponse('Failed to update payment config', 500, error);
  }
}
