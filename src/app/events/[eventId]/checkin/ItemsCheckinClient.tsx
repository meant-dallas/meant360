'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDate } from '@/lib/utils';
import PublicLayout from '@/components/events/PublicLayout';
import EventBottomNav from '@/components/events/EventBottomNav';
import { validateName, validateAge } from '@/lib/validation';
import toast from 'react-hot-toast';
import type { ItemsTerminology } from '@/types';
import { HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlinePlus } from 'react-icons/hi2';

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
  terminology: ItemsTerminology;
}

type Step = 'identify' | 'otp_verify' | 'not_found' | 'checkin';

export default function ItemsCheckinClient({ eventId, event, terminology }: ItemsCheckinClientProps) {
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

  // "Add walk-in" — grows the General Attendance headcount on this
  // registration without going through the full register flow again.
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInError, setWalkInError] = useState('');
  const [walkInSaving, setWalkInSaving] = useState(false);

  // "Check in as a walk-in" — for someone with NO prior registration at all
  // (the not_found step). Creates a brand-new registration on the spot and
  // checks it in immediately, distinct from addWalkIn above which only
  // grows an existing one.
  const [newWalkInName, setNewWalkInName] = useState('');
  const [newWalkInAge, setNewWalkInAge] = useState('');
  const [newWalkInError, setNewWalkInError] = useState('');
  const [newWalkInSaving, setNewWalkInSaving] = useState(false);

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

  const handleAddWalkIn = async () => {
    if (!registration) return;
    setWalkInError('');
    const nameErr = validateName(walkInName);
    const ageErr = validateAge(walkInAge);
    if (nameErr || ageErr) { setWalkInError(nameErr || ageErr || ''); return; }
    setWalkInSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${registration.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walkInName.trim(), age: walkInAge.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${terminology.participantNoun} added`);
        setRegistration((r) => r && ({ ...r, participants: [...r.participants, json.data.participant] }));
        setWalkInName('');
        setWalkInAge('');
        setAddingWalkIn(false);
      } else {
        setWalkInError(json.error || `Failed to add ${terminology.participantNoun.toLowerCase()}`);
      }
    } catch {
      setWalkInError(`Failed to add ${terminology.participantNoun.toLowerCase()}`);
    } finally {
      setWalkInSaving(false);
    }
  };

  const handleWalkInCheckin = async () => {
    setNewWalkInError('');
    const nameErr = validateName(newWalkInName);
    const ageErr = newWalkInAge ? validateAge(newWalkInAge) : '';
    if (nameErr || ageErr) { setNewWalkInError(nameErr || ageErr || ''); return; }
    setNewWalkInSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/walkin-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWalkInName.trim(), age: newWalkInAge.trim(), email: email.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Checked in');
        setRegistration(json.data);
        setStep('checkin');
      } else {
        setNewWalkInError(json.error || 'Failed to check in');
      }
    } catch {
      setNewWalkInError('Failed to check in. Please try again.');
    } finally {
      setNewWalkInSaving(false);
    }
  };

  return (
    <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg" variant="ticket">
      <div className="pb-16">
      <p className="text-sm text-slate-500 mb-4">{formatDate(event.date)} · Check-in</p>

      {step === 'identify' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <div className="text-center">
            <HiOutlineShieldCheck className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h2 className="text-sm font-semibold text-slate-900">Verify Your Email</h2>
            <p className="text-xs text-slate-500 mt-1">We&apos;ll send a code to confirm it&apos;s you before checking you in.</p>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }} />
          </div>
          {otpError && <p className="text-sm text-red-600">{otpError}</p>}
          <button onClick={handleSendCode} disabled={otpSending} className="btn-primary w-full">{otpSending ? 'Sending…' : 'Send Code'}</button>
        </div>
      )}

      {step === 'otp_verify' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <div className="text-center">
            <p className="text-sm text-slate-600">We sent a 6-digit code to <span className="font-medium text-slate-900">{email}</span></p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full text-center text-2xl font-bold font-mono tabular-nums tracking-widest input"
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
          />
          {otpError && <p className="text-sm text-red-600 text-center">{otpError}</p>}
          <button onClick={handleVerifyCode} disabled={otpVerifying || otpCode.length !== 6} className="btn-primary w-full">{otpVerifying ? 'Verifying…' : 'Verify'}</button>
          <div className="flex items-center justify-between text-xs">
            <button onClick={() => { setStep('identify'); setOtpCode(''); setOtpError(''); }} className="text-slate-500 hover:text-slate-700">← Change email</button>
            <button onClick={handleSendCode} disabled={otpSending} className="text-primary-600 hover:text-primary-700">Resend code</button>
          </div>
        </div>
      )}

      {step === 'not_found' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <div className="text-center">
            <p className="text-sm text-slate-700">We couldn&apos;t find a registration for {email} at this event.</p>
            <p className="text-xs text-slate-500 mt-1">Walking in without registering ahead of time? Enter your details below and we&apos;ll check you in now.</p>
          </div>
          <div>
            <label className="label">{terminology.participantNoun} name</label>
            <input
              type="text"
              value={newWalkInName}
              onChange={(e) => { setNewWalkInName(e.target.value); setNewWalkInError(''); }}
              className="input"
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Age (optional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={newWalkInAge}
              onChange={(e) => { setNewWalkInAge(e.target.value.replace(/\D/g, '').slice(0, 3)); setNewWalkInError(''); }}
              className="input"
              placeholder="Age"
            />
          </div>
          {newWalkInError && <p className="text-sm text-red-600">{newWalkInError}</p>}
          <button onClick={handleWalkInCheckin} disabled={newWalkInSaving} className="btn-primary w-full">
            {newWalkInSaving ? 'Checking in…' : 'Check In as Walk-in'}
          </button>
          <button onClick={() => { setStep('identify'); setEmail(''); setNewWalkInError(''); }} className="text-xs text-slate-500 hover:text-slate-700 w-full text-center">
            ← Use a different email
          </button>
        </div>
      )}

      {step === 'checkin' && registration && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-dashed border-slate-200">
            <p className="text-sm font-semibold text-slate-900">{registration.contactName}</p>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums uppercase tracking-wide mt-0.5">
              {registration.participants.length} {registration.participants.length !== 1 ? terminology.participantNounPlural.toLowerCase() : terminology.participantNoun.toLowerCase()} on this {terminology.registrationNoun.toLowerCase()}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {registration.participants.length === 0 && (
              <p className="text-xs text-slate-500 px-4 py-3">No named attendees on this {terminology.registrationNoun.toLowerCase()}.</p>
            )}
            {registration.participants.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.checkedInAt ? 'bg-slate-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${p.checkedInAt ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {p.name}{p.age ? ` (${p.age})` : ''}
                  </p>
                  {p.checkedInAt && <p className="text-[11px] text-green-600 font-mono tabular-nums mt-0.5">Checked in</p>}
                </div>
                {p.checkedInAt ? (
                  <div className="w-9 h-9 rounded-lg bg-green-500 text-white flex items-center justify-center shrink-0">
                    <HiOutlineCheckCircle className="w-5 h-5" />
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckin(p.id)}
                    disabled={busy === p.id}
                    className="w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 text-xs font-bold disabled:opacity-50 transition-colors"
                    style={{ borderColor: 'var(--btn-color)', color: 'var(--btn-color)' }}
                  >
                    {busy === p.id ? '…' : '—'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100">
            {addingWalkIn ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={walkInName}
                    onChange={(e) => { setWalkInName(e.target.value); setWalkInError(''); }}
                    className="input flex-1"
                    placeholder={`${terminology.participantNoun} name`}
                    autoFocus
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={walkInAge}
                    onChange={(e) => { setWalkInAge(e.target.value.replace(/\D/g, '').slice(0, 3)); setWalkInError(''); }}
                    className="input w-16"
                    placeholder="Age"
                  />
                </div>
                {walkInError && <p className="text-xs text-red-600">{walkInError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleAddWalkIn} disabled={walkInSaving} className="btn-primary text-sm px-3 py-1.5">
                    {walkInSaving ? 'Adding…' : 'Add'}
                  </button>
                  <button onClick={() => { setAddingWalkIn(false); setWalkInName(''); setWalkInAge(''); setWalkInError(''); }} className="btn-secondary text-sm px-3 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingWalkIn(true)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--btn-color)' }}>
                <HiOutlinePlus className="w-4 h-4" /> Add walk-in {terminology.participantNoun.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      )}
      </div>
      <EventBottomNav eventId={eventId} active="checkin" eventDate={event.date} />
    </PublicLayout>
  );
}
