'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { formatCurrency } from '@/lib/utils';
import { FaCcVisa, FaCcMastercard, FaCcAmex, FaPaypal } from 'react-icons/fa6';

interface PaymentFormProps {
  amount: number;
  eventName: string;
  payerName: string;
  payerEmail: string;
  onSuccess: (result: { method: 'square' | 'paypal'; transactionId: string }) => void;
  onCancel: () => void;
  squareFeePercent?: number;
  squareFeeFixed?: number;
  paypalFeePercent?: number;
  paypalFeeFixed?: number;
}

type PaymentState = 'idle' | 'processing' | 'success' | 'error';

function calculateFee(amount: number, percent: number, fixed: number): number {
  const fee = amount * (percent / 100) + fixed;
  return Math.round(fee * 100) / 100;
}

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
const SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID || '';
const SQUARE_LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || '';
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';

// Square SDK URL — sandbox for development, production for live
const SQUARE_SDK_URL = SQUARE_APP_ID.startsWith('sandbox')
  ? 'https://sandbox.web.squarecdn.com/v1/square.js'
  : 'https://web.squarecdn.com/v1/square.js';

export default function PaymentForm({
  amount,
  eventName,
  payerName,
  payerEmail,
  onSuccess,
  onCancel,
  squareFeePercent = 0,
  squareFeeFixed = 0,
  paypalFeePercent = 0,
  paypalFeeFixed = 0,
}: PaymentFormProps) {
  const [state, setState] = useState<PaymentState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [squareReady, setSquareReady] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const cardInstanceRef = useRef<unknown>(null);
  const squareInitializedRef = useRef(false);
  const paypalInitializedRef = useRef(false);

  // Calculate fees
  const squareFee = calculateFee(amount, squareFeePercent, squareFeeFixed);
  const paypalFee = calculateFee(amount, paypalFeePercent, paypalFeeFixed);
  const squareTotal = Math.round((amount + squareFee) * 100) / 100;
  const paypalTotal = Math.round((amount + paypalFee) * 100) / 100;
  const hasSquareFee = squareFee > 0;
  const hasPaypalFee = paypalFee > 0;

  // Don't render if payments disabled or amount is 0
  if (!PAYMENTS_ENABLED || amount <= 0) {
    return null;
  }

  // Initialize Square card form
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const initSquare = useCallback(async () => {
    if (squareInitializedRef.current || !cardContainerRef.current) return;
    if (!(window as unknown as Record<string, unknown>).Square) return;

    squareInitializedRef.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payments = await (window as any).Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
      const card = await payments.card();
      await card.attach(cardContainerRef.current);
      cardInstanceRef.current = card;
      setSquareReady(true);
    } catch (err) {
      console.error('Square init error:', err);
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // If Square SDK already loaded (e.g. from cache), initialize immediately
    if ((window as unknown as Record<string, unknown>).Square) {
      initSquare();
    }
  }, [initSquare]);

  // Initialize PayPal buttons
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (paypalInitializedRef.current || !paypalContainerRef.current || !PAYPAL_CLIENT_ID) return;
    paypalInitializedRef.current = true;

    (async () => {
      try {
        const { loadScript } = await import('@paypal/paypal-js');
        const paypal = await loadScript({
          clientId: PAYPAL_CLIENT_ID,
          currency: 'USD',
        });
        if (!paypal?.Buttons || !paypalContainerRef.current) return;

        paypal.Buttons({
          style: { layout: 'vertical', label: 'pay', height: 45 },
          createOrder: async () => {
            setState('processing');
            setErrorMsg('');
            const res = await fetch('/api/payments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'paypal-create',
                amount: paypalTotal.toFixed(2),
                currency: 'USD',
                description: `${eventName} - ${payerName}`,
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
                  eventName,
                  payerName,
                  payerEmail,
                }),
              });
              const json = await res.json();
              if (!json.success) throw new Error(json.error || 'PayPal capture failed');
              setState('success');
              onSuccess({ method: 'paypal', transactionId: json.data.transactionId });
            } catch (err) {
              setState('error');
              setErrorMsg(err instanceof Error ? err.message : 'PayPal capture failed');
            }
          },
          onCancel: () => {
            setState('idle');
          },
          onError: (err: unknown) => {
            console.error('PayPal error:', err);
            setState('error');
            setErrorMsg('PayPal payment failed. Please try again.');
          },
        }).render(paypalContainerRef.current);

        setPaypalReady(true);
      } catch (err) {
        console.error('PayPal init error:', err);
      }
    })();
  }, [paypalTotal, eventName, payerName, payerEmail, onSuccess]);

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
          currency: 'USD',
          eventName,
          payerName,
          payerEmail,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Square payment failed');
      setState('success');
      onSuccess({ method: 'square', transactionId: json.data.transactionId });
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Payment failed');
    }
  };

  const FeeBreakdown = ({ fee, total, label }: { fee: number; total: number; label: string }) => (
    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-3 text-sm">
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>Subtotal</span>
        <span>{formatCurrency(amount)}</span>
      </div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400 mt-1">
        <span>{label} processing fee</span>
        <span>{formatCurrency(fee)}</span>
      </div>
      <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100 mt-1 pt-1 border-t border-gray-200 dark:border-gray-600">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="card p-6">
      <Script
        src={SQUARE_SDK_URL}
        onLoad={initSquare}
        strategy="lazyOnload"
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
            onClick={() => { setState('idle'); setErrorMsg(''); }}
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
          {SQUARE_APP_ID && (
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
                <FeeBreakdown fee={squareFee} total={squareTotal} label="Card" />
              )}
              <div
                ref={cardContainerRef}
                id="card-container"
                className="min-h-[90px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white"
              />
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
          {SQUARE_APP_ID && PAYPAL_CLIENT_ID && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">or</span>
              <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
            </div>
          )}

          {/* PayPal Buttons */}
          {PAYPAL_CLIENT_ID && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaPaypal className="w-4 h-4 text-[#00457C]" />
                Pay with PayPal
              </h3>
              {hasPaypalFee && (
                <FeeBreakdown fee={paypalFee} total={paypalTotal} label="PayPal" />
              )}
              <div
                ref={paypalContainerRef}
                id="paypal-container"
                className={paypalReady ? '' : 'min-h-[50px]'}
              />
            </div>
          )}

          {/* Skip Payment */}
          <div className="text-center">
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            >
              Skip Payment (pay at desk)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
