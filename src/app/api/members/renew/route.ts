import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, getSessionRole } from '@/lib/api-helpers';
import { renewMembershipOnly } from '@/services/events.service';
import { logActivity } from '@/lib/audit-log';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const renewSchema = z.object({
  memberId: z.string().min(1),
  membershipType: z.string().min(1),
  amount: z.string(),
  payerName: z.string().min(1),
  payerEmail: z.string().email(),
  paymentMethod: z.string().optional().default(''),
  transactionId: z.string().optional().default(''),
  eventName: z.string().optional().default(''),
});

export async function POST(request: NextRequest) {
  // Require authenticated session
  const { role, email: sessionEmail, authenticated } = await getSessionRole();
  if (!authenticated) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const parsed = renewSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Invalid request', 400);
    }

    const data = parsed.data;

    // Only allow renewing for your own email, unless admin/committee
    const isAdminOrCommittee = role === 'admin' || role === 'committee';
    if (
      !isAdminOrCommittee &&
      sessionEmail?.toLowerCase() !== data.payerEmail.toLowerCase()
    ) {
      return errorResponse('Forbidden: can only renew your own membership', 403);
    }
    const result = await renewMembershipOnly({
      memberId: data.memberId,
      membershipType: data.membershipType,
      amount: data.amount,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
      paymentMethod: data.paymentMethod,
      transactionId: data.transactionId,
      eventName: data.eventName,
    });

    logActivity({
      userEmail: data.payerEmail,
      action: 'update',
      entityType: 'Member',
      entityId: data.memberId,
      entityLabel: data.payerName,
      description: `Membership renewed (${data.membershipType}) - $${data.amount}`,
    });

    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to renew membership';
    if (message.includes('not found')) return errorResponse(message, 404);
    console.error('POST /api/members/renew error:', error);
    Sentry.captureException(error, { extra: { context: 'Members renew POST' } });
    return errorResponse('Failed to renew membership', 500, error);
  }
}
