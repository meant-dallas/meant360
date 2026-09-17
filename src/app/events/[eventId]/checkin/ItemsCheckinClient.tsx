'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDate } from '@/lib/utils';
import PublicLayout from '@/components/events/PublicLayout';
import toast from 'react-hot-toast';
import { HiOutlineCheckCircle, HiOutlineShieldCheck } from 'react-icons/hi2';

interface Participant {
  id: string;
  name: string;
  age: string;
  checkedInAt: string;
}

interface Registration {
  id: string;
  contactName: string;
  registrationStatus: string;
  participants: Participant[];
}

interface ItemsCheckinClientProps {
  eventId: string;
  event: { name: string; date: string; categoryLogoUrl?: string; categoryBgColor?: string };
}

type Step = 'identify' | 'otp_verify' | 'not_found' | 'checkin';

export default function ItemsCheckinClient({ eventId, event }: ItemsCheckinClientProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sessionResumeTried = useRef(false);

  const applyLookup = (data: { existingRegistration: Registration | null }) => {
    if (!data.existingRegistration || data.existingRegistration.registrationStatus === 'cancelled') {
      setStep('not_found');
      return;
    }
    setRegistration(data.existingRegistration);
    setStep('checkin');
  };

  // Resume an existing NextAuth session or still-valid guest-session cookie
  // instead of asking for OTP again.
  useEffect(() => {
    if (step !== 'identify' || sessionResumeTried.current) return;
    sessionResumeTried.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/items-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'session' }),
        });
        const json = await res.json();
        if (json.success) { setEmail(json.data.email); applyLookup(json.data); }
      } catch { /* fall through to manual identify */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, session]);

  const handleSendCode = async () => {
    setOtpError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setOtpError('Enter a valid email address.');
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: email.trim(), skipMemberCheck: true }),
      });
      const json = await res.json();
      if (!json.success) { setOtpError(json.error || 'Failed to send code'); return; }
      setStep('otp_verify');
    } catch {
      setOtpError('Failed to send code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyCode = async () => {
    setOtpError('');
    if (otpCode.trim().length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpVerifying(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: email.trim(), code: otpCode.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setOtpError(json.error || 'Invalid or expired code'); setOtpVerifying(false); return; }
      applyLookup(json.data);
    } catch {
      setOtpError('Failed to verify code. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleCheckin = async (participantId: string) => {
    if (!registration) return;
    setBusy(participantId);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${registration.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Checked in');
        setRegistration((r) => r && ({
          ...r,
          participants: r.participants.map((p) => (p.id === participantId ? { ...p, checkedInAt: json.data.checkedInAt } : p)),
        }));
      } else {
        toast.error(json.error || 'Failed to check in');
      }
    } catch {
      toast.error('Failed to check in');
    } finally {
      setBusy(null);
    }
  };

  return (
    <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg">
      <p className="text-sm text-gray-500 mb-4">{formatDate(event.date)} · Check-in</p>

      {step === 'identify' && (
        <div className="card p-6 space-y-4">
          <div className="text-center">
            <HiOutlineShieldCheck className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Verify Your Email</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">We&apos;ll send a code to confirm it&apos;s you before checking you in.</p>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }} />
          </div>
          {otpError && <p className="text-sm text-red-600 dark:text-red-400">{otpError}</p>}
          <button onClick={handleSendCode} disabled={otpSending} className="btn-primary w-full">{otpSending ? 'Sending…' : 'Send Code'}</button>
        </div>
      )}

      {step === 'otp_verify' && (
        <div className="card p-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">We sent a 6-digit code to <span className="font-medium text-gray-900 dark:text-gray-100">{email}</span></p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full text-center text-2xl font-bold tracking-widest input"
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
          />
          {otpError && <p className="text-sm text-red-600 dark:text-red-400 text-center">{otpError}</p>}
          <button onClick={handleVerifyCode} disabled={otpVerifying || otpCode.length !== 6} className="btn-primary w-full">{otpVerifying ? 'Verifying…' : 'Verify'}</button>
          <div className="flex items-center justify-between text-xs">
            <button onClick={() => { setStep('identify'); setOtpCode(''); setOtpError(''); }} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">← Change email</button>
            <button onClick={handleSendCode} disabled={otpSending} className="text-primary-600 hover:text-primary-700">Resend code</button>
          </div>
        </div>
      )}

      {step === 'not_found' && (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">We couldn&apos;t find a registration for this email at this event.</p>
        </div>
      )}

      {step === 'checkin' && registration && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{registration.contactName}</p>
          <div className="space-y-1">
            {registration.participants.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No named attendees on this registration.</p>}
            {registration.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm py-1">
                <span className="flex-1 text-gray-700 dark:text-gray-300">{p.name}{p.age ? ` (${p.age})` : ''}</span>
                {p.checkedInAt ? (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Checked in</span>
                ) : (
                  <button onClick={() => handleCheckin(p.id)} disabled={busy === p.id} className="btn-primary text-xs px-2 py-1">Check In</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
