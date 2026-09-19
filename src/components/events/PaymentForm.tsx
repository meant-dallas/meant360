'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import Script from 'next/script';
import { formatCurrency } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { FaCcVisa, FaCcMastercard, FaCcAmex, FaPaypal, FaCreditCard } from 'react-icons/fa6';
import { HiOutlineBanknotes, HiOutlineClock, HiOutlineCheckCircle } from 'react-icons/hi2';

type PaymentProvider = 'square' | 'paypal' | 'square-reader' | 'zelle';

// Extra check-in context needed only by the Square Reader path — it hands
// the browser off to the Square app and gets a result back later via a
// server-side callback, so the full check-in payload has to be captured
// up front rather than resumed from this component's in-memory state.
export interface SquareReaderCheckinContext {
  type: 'Member' | 'Guest';
  memberId: string;
  guestId: string;
  phone: string;
  adults: number;
  kids: number;
  totalPrice: string;
  priceBreakdown: string;
  selectedActivities?: string;
  customFields?: string;
  attendeeNames?: string;
  emailConsent?: string;
  mediaConsent?: string;
}

interface PaymentFormProps {
  amount: number;
  eventId: string;
  eventName: string;
  payerName: string;
  payerEmail: string;
  onSuccess: (result: { method: 'square' | 'paypal' | 'zelle'; transactionId: string }) => void;
  onCancel: () => void;
  squareFeePercent?: number;
  squareFeeFixed?: number;
  paypalFeePercent?: number;
  paypalFeeFixed?: number;
  zelleEmail?: string;
  zellePhone?: string;
  showSquareReader?: boolean;
  checkinContext?: SquareReaderCheckinContext;
  providers?: PaymentProvider[];
}

type PaymentState = 'idle' | 'processing' | 'success' | 'error';

function calculateFee(amount: number, percent: number, fixed: number): number {
  const fee = amount * (percent / 100) + fixed;
  return Math.round(fee * 100) / 100;
}

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
const RAW_SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID || '';
const SQUARE_APP_ID = RAW_SQUARE_APP_ID.startsWith('your_') ? '' : RAW_SQUARE_APP_ID;
const SQUARE_LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || '';
const RAW_PAYPAL_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_ID = RAW_PAYPAL_ID.startsWith('your_') ? '' : RAW_PAYPAL_ID;

// Square SDK URL — sandbox for development, production for live
const SQUARE_SDK_URL = SQUARE_APP_ID.startsWith('sandbox')
  ? 'https://sandbox.web.squarecdn.com/v1/square.js'
  : 'https://web.squarecdn.com/v1/square.js';

export default function PaymentForm({
  amount,
  eventId,
  eventName,
  payerName,
  payerEmail,
  onSuccess,
  onCancel,
  squareFeePercent = 0,
  squareFeeFixed = 0,
  paypalFeePercent = 0,
  paypalFeeFixed = 0,
  zelleEmail = '',
  zellePhone = '',
  showSquareReader = false,
  checkinContext,
  providers,
}: PaymentFormProps) {
  const [state, setState] = useState<PaymentState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [squareReady, setSquareReady] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalInitError, setPaypalInitError] = useState(false);
  const [paypalRetryCount, setPaypalRetryCount] = useState(0);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [readerState, setReaderState] = useState<'idle' | 'creating' | 'error'>('idle');
  const [readerError, setReaderError] = useState('');
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const cardInstanceRef = useRef<unknown>(null);
  const paypalInitializedRef = useRef(false);

  // Calculate fees
  const squareFee = calculateFee(amount, squareFeePercent, squareFeeFixed);
  const paypalFee = calculateFee(amount, paypalFeePercent, paypalFeeFixed);
  const squareTotal = Math.round((amount + squareFee) * 100) / 100;
  const paypalTotal = Math.round((amount + paypalFee) * 100) / 100;
  const hasSquareFee = squareFee > 0;
  const hasPaypalFee = paypalFee > 0;

  const [zelleConfirmed, setZelleConfirmed] = useState(false);

  // Determine which providers to show
  const showSquare = SQUARE_APP_ID && (!providers || providers.includes('square'));
  const showPaypal = PAYPAL_CLIENT_ID && (!providers || providers.includes('paypal'));
  const showReaderProvider = showSquareReader && SQUARE_APP_ID && Boolean(checkinContext) && (!providers || providers.includes('square-reader'));
  const showZelle = (zelleEmail || zellePhone) && (!providers || providers.includes('zelle'));
  const hasAlternativePaymentMethod = Boolean(showSquare || showZelle || showReaderProvider);
  const paypalFallbackSuffix = hasAlternativePaymentMethod
    ? ' Please try another payment method below.'
    : ' Please contact us at info@meantdallas.org for help completing your registration.';

  const shouldRender = PAYMENTS_ENABLED && amount > 0;

  // Initialize Square card form when SDK is loaded and container is mounted
  const initSquare = useCallback(async () => {
    if (!cardContainerRef.current) return;
    if (!(window as unknown as Record<string, unknown>).Square) return;

    // Detach previous card instance if retrying
    if (cardInstanceRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (cardInstanceRef.current as any).destroy();
      } catch { /* ignore */ }
      cardInstanceRef.current = null;
      setSquareReady(false);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payments = await (window as any).Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
      // Square iframe always has a white background — use dark text in all modes
      const cardOptions = {
        style: {
          input: { color: '#111827', fontSize: '16px' },
          'input::placeholder': { color: '#6b7280' },
          '.message-text': { color: '#dc2626' },
        },
      };
      const card = await payments.card(cardOptions);
      await card.attach(cardContainerRef.current);
      cardInstanceRef.current = card;
      setSquareReady(true);
      analytics.paymentStarted('square', squareTotal);
    } catch (err) {
      console.error('Square init error:', err);
      Sentry.captureException(err, { extra: { context: 'Square payment init' } });
      setErrorMsg('Failed to load card form. Please refresh and try again.');
      setState('error');
      analytics.paymentFailed('square', err instanceof Error ? err.message : 'Failed to load card form');
    }
  }, []);

  // Try to init Square when SDK loads or component mounts
  useEffect(() => {
    if (!shouldRender || !SQUARE_APP_ID) return;
    // Check if SDK is already available (cached from previous page)
    if ((window as unknown as Record<string, unknown>).Square) {
      setSdkLoaded(true);
    }
  }, [shouldRender]);

  // When SDK is loaded and DOM is ready, initialize (also re-init on retry)
  useEffect(() => {
    if (!shouldRender || !sdkLoaded) return;
    // Small delay to ensure the card container ref is attached after render
    const timer = setTimeout(() => {
      initSquare();
    }, 100);
    return () => clearTimeout(timer);
  }, [shouldRender, sdkLoaded, initSquare, retryCount]);

  // Initialize PayPal buttons
  useEffect(() => {
    if (!shouldRender || paypalInitializedRef.current || !paypalContainerRef.current || !PAYPAL_CLIENT_ID) return;
    paypalInitializedRef.current = true;
    setPaypalInitError(false);

    (async () => {
      try {
        const { loadScript } = await import('@paypal/paypal-js');
        const paypal = await loadScript({
          clientId: PAYPAL_CLIENT_ID,
          currency: 'USD',
        });
        if (!paypal?.Buttons || !paypalContainerRef.current) {
          const err = new Error('PayPal SDK loaded without a usable Buttons component');
          console.error('PayPal init error:', err);
          Sentry.captureException(err, { extra: { context: 'PayPal init' } });
          setPaypalInitError(true);
          analytics.paymentFailed('paypal', err.message);
          return;
        }

        paypal.Buttons({
          style: { layout: 'vertical', label: 'pay', height: 45 },
          createOrder: async () => {
            setErrorMsg('');
            const res = await fetch('/api/payments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'paypal-create',
                amount: paypalTotal.toFixed(2),
                currency: 'USD',
                description: `${eventName} - ${payerName}`,
                eventId,
                itemName: eventName,
                payerName,
                payerEmail,
              }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to create PayPal order');
            return json.data.orderId;
          },
          onApprove: async (data: { orderID: string }) => {
            try {
              const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'paypal-capture',
                  orderId: data.orderID,
                  amount: paypalTotal.toFixed(2),
                  baseAmount: amount,
                  eventId,
                  eventName,
                  payerName,
                  payerEmail,
                }),
              });
              const json = await res.json();
              if (!json.success) throw new Error(json.error || 'PayPal capture failed');
              setState('success');
              analytics.paymentCompleted('paypal', paypalTotal, json.data.transactionId);
              onSuccess({ method: 'paypal', transactionId: json.data.transactionId });
            } catch (err) {
              setState('error');
              const message = err instanceof Error ? err.message : 'PayPal capture failed';
              setErrorMsg(`${message}${paypalFallbackSuffix}`);
              analytics.paymentFailed('paypal', message);
            }
          },
          onCancel: () => {
            setState('idle');
          },
          onError: (err: unknown) => {
            console.error('PayPal error:', err);
            Sentry.captureException(err, { extra: { context: 'PayPal payment' } });
            setState('error');
            setErrorMsg(`PayPal payment failed.${paypalFallbackSuffix}`);
            analytics.paymentFailed('paypal', err instanceof Error ? err.message : 'PayPal payment failed');
          },
        }).render(paypalContainerRef.current);

        setPaypalReady(true);
        analytics.paymentStarted('paypal', paypalTotal);
      } catch (err) {
        console.error('PayPal init error:', err);
        Sentry.captureException(err, { extra: { context: 'PayPal init' } });
        setPaypalInitError(true);
        analytics.paymentFailed('paypal', err instanceof Error ? err.message : 'Failed to load PayPal');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, paypalTotal, eventId, eventName, payerName, payerEmail, paypalRetryCount]);

  const handleSquarePay = async () => {
    if (!cardInstanceRef.current) return;
    setState('processing');
    setErrorMsg('');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenResult = await (cardInstanceRef.current as any).tokenize();
      if (tokenResult.status !== 'OK') {
        throw new Error(tokenResult.errors?.[0]?.message || 'Card tokenization failed');
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'square-pay',
          sourceId: tokenResult.token,
          amount: squareTotal.toFixed(2),
          baseAmount: amount,
          currency: 'USD',
          eventId,
          eventName,
          payerName,
          payerEmail,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Square payment failed');
      setState('success');
      analytics.paymentCompleted('square', squareTotal, json.data.transactionId);
      onSuccess({ method: 'square', transactionId: json.data.transactionId });
    } catch (err) {
      setState('error');
      const message = err instanceof Error ? err.message : 'Payment failed';
      setErrorMsg(message);
      analytics.paymentFailed('square', message);
    }
  };

  const handleReaderPay = async () => {
    if (!checkinContext) return;
    setReaderState('creating');
    setReaderError('');

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    if (!isIOS && !isAndroid) {
      setReaderState('error');
      setReaderError('Square Reader requires an iPhone or Android phone with the Square app installed.');
      return;
    }

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'square-reader-create',
          eventId,
          amount: squareTotal.toFixed(2),
          baseAmount: amount,
          currency: 'USD',
          checkin: {
            eventName,
            type: checkinContext.type,
            memberId: checkinContext.memberId,
            guestId: checkinContext.guestId,
            name: payerName,
            email: payerEmail,
            phone: checkinContext.phone,
            adults: checkinContext.adults,
            kids: checkinContext.kids,
            totalPrice: checkinContext.totalPrice,
            priceBreakdown: checkinContext.priceBreakdown,
            selectedActivities: checkinContext.selectedActivities,
            customFields: checkinContext.customFields,
            attendeeNames: checkinContext.attendeeNames,
            emailConsent: checkinContext.emailConsent,
            mediaConsent: checkinContext.mediaConsent,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to start Square Reader checkout');

      analytics.paymentStarted('square', squareTotal);
      // Navigate away to the Square app — there is no further UI to show
      // from here; the check-in page picks up the result after the
      // callback redirects the browser back.
      window.location.href = isIOS ? json.data.ios : json.data.android;
    } catch (err) {
      setReaderState('error');
      setReaderError(err instanceof Error ? err.message : 'Failed to start Square Reader checkout');
    }
  };

  const handleSdkLoad = useCallback(() => {
    setSdkLoaded(true);
  }, []);

  // Don't render if payments disabled or amount is 0
  if (!shouldRender) {
    return null;
  }

  const FeeBreakdown = ({ fee, total, label, percent, fixed }: { fee: number; total: number; label: string; percent?: number; fixed?: number }) => (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3 text-sm">
      <p className="text-amber-700 dark:text-amber-300 text-xs font-medium mb-2">
        {label} charges a processing fee of {percent ? `${percent}%` : ''}{percent && fixed ? ' + ' : ''}{fixed ? `$${fixed.toFixed(2)}` : ''} per transaction
      </p>
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>Subtotal</span>
        <span>{formatCurrency(amount)}</span>
      </div>
      <div className="flex justify-between text-amber-600 dark:text-amber-400 mt-1">
        <span>{label} processing fee</span>
        <span>+{formatCurrency(fee)}</span>
      </div>
      <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100 mt-1 pt-1 border-t border-amber-200 dark:border-amber-700">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );

  const Divider = () => (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">or</span>
      <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
    </div>
  );

  return (
    <div className="card p-6">
      <Script
        src={SQUARE_SDK_URL}
        onLoad={handleSdkLoad}
        strategy="afterInteractive"
      />

      {/* Price Summary */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payment</h2>
        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-1">{formatCurrency(amount)}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{eventName}</p>
      </div>

      {state === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
          <button
            onClick={() => { setState('idle'); setErrorMsg(''); setRetryCount(c => c + 1); }}
            className="text-sm text-red-600 dark:text-red-400 underline mt-1"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="text-center py-4 mb-4">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Processing payment...</p>
        </div>
      )}

      {state !== 'success' && state !== 'processing' && (
        <>
          {/* Square Card Form */}
          {showSquare && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                Pay with Card
                <span className="inline-flex items-center gap-1 ml-auto">
                  <FaCcVisa className="w-6 h-4 text-blue-400" />
                  <FaCcMastercard className="w-6 h-4 text-orange-400" />
                  <FaCcAmex className="w-6 h-4 text-blue-300" />
                </span>
              </h3>
              {hasSquareFee && (
                <FeeBreakdown fee={squareFee} total={squareTotal} label="Card" percent={squareFeePercent} fixed={squareFeeFixed} />
              )}
              <div className="relative">
                {!squareReady && (
                  <div className="absolute inset-0 flex items-center justify-center min-h-[90px]">
                    <div className="w-6 h-6 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading card form...</span>
                  </div>
                )}
                <div
                  ref={cardContainerRef}
                  className={`min-h-[90px] rounded-lg bg-white ${!squareReady ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                />
              </div>
              <button
                onClick={handleSquarePay}
                disabled={!squareReady || state !== 'idle'}
                className="btn-primary w-full mt-3 disabled:opacity-50"
              >
                {hasSquareFee ? `Pay ${formatCurrency(squareTotal)} with Card` : 'Pay with Card'}
              </button>
            </div>
          )}

          {/* Divider */}
          {showSquare && showPaypal && <Divider />}

          {/* PayPal Buttons */}
          {showPaypal && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaPaypal className="w-4 h-4 text-[#00457C]" />
                Pay with PayPal
              </h3>
              {hasPaypalFee && (
                <FeeBreakdown fee={paypalFee} total={paypalTotal} label="PayPal" percent={paypalFeePercent} fixed={paypalFeeFixed} />
              )}
              {paypalInitError ? (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm">
                  <p className="text-red-700 dark:text-red-300">
                    {hasAlternativePaymentMethod
                      ? "PayPal isn't available right now. Please try another payment method below, or retry."
                      : (
                        <>
                          PayPal isn&apos;t available right now. Please retry, or contact us at{' '}
                          <a href="mailto:info@meantdallas.org" className="underline">info@meantdallas.org</a>{' '}
                          for help completing your registration.
                        </>
                      )}
                  </p>
                  <button
                    onClick={() => {
                      paypalInitializedRef.current = false;
                      setPaypalInitError(false);
                      setPaypalRetryCount((c) => c + 1);
                    }}
                    className="text-sm text-red-600 dark:text-red-400 underline mt-1"
                  >
                    Retry PayPal
                  </button>
                </div>
              ) : (
                <div
                  ref={paypalContainerRef}
                  id="paypal-container"
                  className={paypalReady ? '' : 'min-h-[50px]'}
                />
              )}
            </div>
          )}

          {/* Square Reader (in-person, via staff's phone) */}
          {showReaderProvider && readerState !== 'error' && (
            <>
              {(showSquare || showPaypal) && <Divider />}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <FaCreditCard className="w-4 h-4 text-gray-500" />
                  In-Person Payment
                </h3>
                {hasSquareFee && (
                  <FeeBreakdown fee={squareFee} total={squareTotal} label="Card" percent={squareFeePercent} fixed={squareFeeFixed} />
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Opens the Square app on this phone — tap the guest&apos;s card on your connected Square Reader.
                </p>
                <button
                  onClick={handleReaderPay}
                  disabled={readerState === 'creating'}
                  className="btn-primary w-full bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  {readerState === 'creating' ? 'Opening Square...' : 'Charge using Square Reader'}
                </button>
              </div>
            </>
          )}

          {/* Reader: error starting the checkout */}
          {showReaderProvider && readerState === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700 dark:text-red-300">{readerError}</p>
              <button
                onClick={() => { setReaderState('idle'); setReaderError(''); }}
                className="text-sm text-red-600 dark:text-red-400 underline mt-1"
              >
                Try again
              </button>
            </div>
          )}

          {/* Zelle Payment */}
          {showZelle && (
            <>
              {(showSquare || showPaypal || showReaderProvider) && <Divider />}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <HiOutlineBanknotes className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Pay with Zelle
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                    No fees
                  </span>
                </h3>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3 text-sm">
                  <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                    <span>Total</span>
                    <span>{formatCurrency(amount)}</span>
                  </div>
                  <p className="text-green-700 dark:text-green-300 text-xs mt-1">No processing fees — you pay exactly the listed amount</p>
                </div>

                {!zelleConfirmed ? (
                  <div className="space-y-3">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm space-y-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100">Send {formatCurrency(amount)} via Zelle to:</p>
                      {zelleEmail && (
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-12">Email:</span>
                          <span className="font-mono font-medium">{zelleEmail}</span>
                        </div>
                      )}
                      {zellePhone && (
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-12">Phone:</span>
                          <span className="font-mono font-medium">{zellePhone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                      <HiOutlineClock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Zelle payments require manual verification by our committee. Your request will be placed <strong>on hold</strong> and processed within <strong>1 business day</strong> once the payment is confirmed.
                      </p>
                    </div>

                    <button
                      onClick={() => setZelleConfirmed(true)}
                      className="btn-primary w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500"
                    >
                      I&apos;ve Sent the Payment via Zelle
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                      <HiOutlineCheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">Thank you! Your Zelle payment will be verified shortly.</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">Your request will be on hold until the payment is confirmed (~1 business day).</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setZelleConfirmed(false)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        Go Back
                      </button>
                      <button
                        onClick={() => {
                          analytics.paymentCompleted('zelle', amount, 'zelle-pending');
                          onSuccess({ method: 'zelle', transactionId: 'zelle-pending' });
                        }}
                        className="btn-primary flex-1 bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </>
      )}
    </div>
  );
}
