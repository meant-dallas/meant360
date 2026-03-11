import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { paymentSchema } from '@/types/schemas';
import { processSquarePayment, createPayPalOrderService, capturePayPalOrderService, createTerminalPayment, getTerminalPaymentStatus, cancelTerminalPayment } from '@/services/payments.service';
import { NotFoundError } from '@/services/crud.service';
import { logActivity } from '@/lib/audit-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = await validateBody(paymentSchema, body);
    if (validated instanceof NextResponse) return validated;

    if (validated.action === 'square-pay') {
      const result = await processSquarePayment({
        sourceId: validated.sourceId,
        amount: validated.amount,
        currency: validated.currency,
        eventId: validated.eventId,
        eventName: validated.eventName,
        payerName: validated.payerName,
        payerEmail: validated.payerEmail,
      });

      logActivity({
        userEmail: validated.payerEmail || '',
        action: 'create',
        entityType: 'Payment',
        entityId: (result as Record<string, string>).transactionId || '',
        entityLabel: `Square $${validated.amount}`,
        description: `Square payment of $${validated.amount} by ${validated.payerName || 'unknown'}`,
      });

      return jsonResponse(result);
    }

    if (validated.action === 'paypal-create') {
      const result = await createPayPalOrderService({
        amount: validated.amount,
        currency: validated.currency,
        description: validated.description,
        eventId: validated.eventId,
      });
      return jsonResponse(result);
    }

    if (validated.action === 'paypal-capture') {
      const result = await capturePayPalOrderService({
        orderId: validated.orderId,
        eventId: validated.eventId,
        eventName: validated.eventName,
        payerName: validated.payerName,
        payerEmail: validated.payerEmail,
        amount: validated.amount,
      });

      logActivity({
        userEmail: validated.payerEmail || '',
        action: 'create',
        entityType: 'Payment',
        entityId: validated.orderId || '',
        entityLabel: `PayPal $${validated.amount}`,
        description: `PayPal payment of $${validated.amount} by ${validated.payerName || 'unknown'}`,
      });

      return jsonResponse(result);
    }

    if (validated.action === 'terminal-create') {
      const result = await createTerminalPayment({
        amount: validated.amount,
        currency: validated.currency,
        deviceId: validated.deviceId,
        eventId: validated.eventId,
        eventName: validated.eventName,
        payerName: validated.payerName,
        payerEmail: validated.payerEmail,
      });

      logActivity({
        userEmail: validated.payerEmail || '',
        action: 'create',
        entityType: 'Payment',
        entityId: result.checkoutId,
        entityLabel: `Terminal $${validated.amount}`,
        description: `Terminal checkout initiated for $${validated.amount} by ${validated.payerName || 'unknown'}`,
      });

      return jsonResponse(result);
    }

    if (validated.action === 'terminal-status') {
      const result = await getTerminalPaymentStatus({
        checkoutId: validated.checkoutId,
        eventId: validated.eventId,
        eventName: validated.eventName,
        payerName: validated.payerName,
        payerEmail: validated.payerEmail,
        amount: validated.amount,
      });

      if (result.status === 'COMPLETED' && result.paymentId) {
        logActivity({
          userEmail: validated.payerEmail || '',
          action: 'create',
          entityType: 'Payment',
          entityId: result.paymentId,
          entityLabel: `Terminal $${validated.amount}`,
          description: `Terminal payment of $${validated.amount} by ${validated.payerName || 'unknown'}`,
        });
      }

      return jsonResponse(result);
    }

    if (validated.action === 'terminal-cancel') {
      const result = await cancelTerminalPayment(validated.checkoutId);
      return jsonResponse(result);
    }

    return errorResponse('Unknown action', 400);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('POST /api/payments error:', error);
    const message = error instanceof Error ? error.message : 'Payment failed';
    return errorResponse(message, 500, error);
  }
}
