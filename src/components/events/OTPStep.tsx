'use client';

import { useState, useRef } from 'react';
import type { OTPVerifiedProfile } from '@/types/event-registration';
import { sendCheckinOTP, verifyCheckinOTP } from '@/lib/event-registration-api';

interface OTPStepProps {
  email: string;
  eventId: string;
  purpose: 'checkin' | 'guest-registration';
  onVerified: (profile: OTPVerifiedProfile) => void;
  onBack: () => void;
}

export default function OTPStep({ email, eventId, purpose, onVerified, onBack }: OTPStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const purposeLabel = purpose === 'checkin' ? 'check in' : 'register';

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setVerifying(true);
    try {
      const profile = await verifyCheckinOTP(eventId, email, code.trim());
      onVerified(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code');
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendSuccess(false);
    setError('');
    try {
      await sendCheckinOTP(eventId, email);
      setResendSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm text-gray-600">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <p className="text-xs text-gray-400">
          Enter the code below to {purposeLabel}.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder="000000"
          className="w-48 text-center text-3xl font-bold tracking-widest border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--btn-color)] focus:ring-2 focus:ring-[var(--btn-ring)]"
          onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
        />

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        {resendSuccess && (
          <p className="text-sm text-green-600 text-center">A new code has been sent.</p>
        )}
      </div>

      <button
        onClick={handleVerify}
        disabled={verifying || code.length !== 6}
        className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--btn-color)] hover:bg-[var(--btn-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {verifying ? 'Verifying...' : 'Verify'}
      </button>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <button
          onClick={onBack}
          className="hover:text-gray-600 transition-colors"
        >
          &larr; Change email
        </button>
        <button
          onClick={handleResend}
          disabled={resending}
          className="hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          {resending ? 'Sending...' : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
