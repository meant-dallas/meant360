import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
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
  try {
    const body = await request.json();
    const parsed = renewSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message || 'Invalid request', 400);
    }

    const data = parsed.data;
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
    return errorResponse('Failed to renew membership', 500, error);
  }
}
