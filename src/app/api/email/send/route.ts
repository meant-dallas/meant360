import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { sendEmailSchema } from '@/types/schemas';
import { sendEmail } from '@/services/email.service';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(sendEmailSchema, body);
    if (validated instanceof NextResponse) return validated;

    const result = await sendEmail(
      validated.to,
      validated.subject,
      validated.body,
      auth.email,
      validated.from,
    );

    if (result.success) {
      return jsonResponse({ provider: result.provider });
    }

    return errorResponse(result.error || 'Failed to send email', 500);
  } catch (error) {
    console.error('POST /api/email/send error:', error);
    Sentry.captureException(error, { extra: { context: 'Email send POST' } });
    return errorResponse('Failed to send email', 500, error);
  }
}
