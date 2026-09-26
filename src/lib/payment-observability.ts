'use client';

import * as Sentry from '@sentry/nextjs';

// Shared client-side instrumentation for the payment/registration/check-in
// flow (PaymentForm, RegisterClient, ItemsRegisterClient, CheckinClient,
// ItemsCheckinClient). Most reports of "payment failed, worked on retry"
// come from mobile devices on flaky connections — tagging every event with
// device/network context lets us confirm that correlation in Sentry instead
// of guessing from user reports.

type NetworkInformation = {
  effectiveType?: string;
  type?: string;
  downlink?: number;
  rtt?: number;
};

export function getClientDeviceContext(): Record<string, string | number | boolean> {
  if (typeof navigator === 'undefined') return {};
  const ua = navigator.userAgent || '';
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const connection = (navigator as unknown as { connection?: NetworkInformation }).connection;

  const context: Record<string, string | number | boolean> = { isMobile, userAgent: ua };
  if (connection?.effectiveType) context.connectionEffectiveType = connection.effectiveType;
  if (connection?.type) context.connectionType = connection.type;
  if (typeof connection?.downlink === 'number') context.connectionDownlinkMbps = connection.downlink;
  if (typeof connection?.rtt === 'number') context.connectionRttMs = connection.rtt;
  if (typeof navigator.onLine === 'boolean') context.onLine = navigator.onLine;
  return context;
}

/**
 * Report a payment/registration flow failure to Sentry with device/network
 * context attached, so mobile-vs-desktop and network-quality correlation is
 * queryable rather than anecdotal.
 */
export function capturePaymentFlowError(error: unknown, context: Record<string, unknown>): void {
  const device = getClientDeviceContext();
  Sentry.captureException(error, {
    tags: {
      isMobile: String(device.isMobile ?? 'unknown'),
      connectionEffectiveType: String(device.connectionEffectiveType ?? 'unknown'),
    },
    extra: { ...context, ...device },
  });
}

/**
 * Breadcrumb for a step in the payment/registration flow. Attaching device
 * context on every breadcrumb (not just the final error) means the trail
 * leading up to a failure also shows if/when connection quality degraded.
 */
export function addPaymentFlowBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'payment-flow',
    message,
    level: 'info',
    data: { ...data, ...getClientDeviceContext() },
  });
}
