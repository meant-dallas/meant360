'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDate, formatCurrency, fetchWithTimeout } from '@/lib/utils';
import { capturePaymentFlowError, addPaymentFlowBreadcrumb } from '@/lib/payment-observability';
import PublicLayout from '@/components/events/PublicLayout';
import EventBottomNav from '@/components/events/EventBottomNav';
import PaymentForm from '@/components/events/PaymentForm';
import FieldError from '@/components/ui/FieldError';
import { validateName, validateAge, validateNameRequired, validateAgeRequired } from '@/lib/validation';
import toast from 'react-hot-toast';
import type { ItemsTerminology, ItemConfig, EventPaymentConfig, MembershipTypeConfig } from '@/types';
import { HiOutlineCheckCircle, HiOutlineMinusCircle, HiOutlineShieldCheck, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';

interface Participant {
  id: string;
  name: string;
  age: string;
  checkedInAt: string;
  isParticipant?: string;
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
  items: ItemConfig[];
  paymentConfig: EventPaymentConfig;
  feeSettings?: { paypalFeePercent?: number; paypalFeeFixed?: number; zelleEmail?: string; zellePhone?: string };
  // Available renewal options for the renewal_required step — an expired
  // member must renew before check-in can proceed (see applyLookup).
  membershipTypes: MembershipTypeConfig[];
}

type Step = 'identify' | 'otp_verify' | 'renewal_required' | 'not_found' | 'walkin_payment' | 'checkin';

interface LookupData {
  existingRegistration: Registration | null;
  isMember?: boolean;
  memberId?: string;
  familyMembers?: { name: string; age: string }[];
  requiresRenewal?: boolean;
  currentMembershipLevel?: string;
}

export default function ItemsCheckinClient({ eventId, event, terminology, items, paymentConfig, feeSettings, membershipTypes }: ItemsCheckinClientProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  // Selected locally only — nothing is written to the DB until "Complete
  // Check-In" fires one batch request, instead of one request per tap.
  const [selectedForCheckin, setSelectedForCheckin] = useState<Set<string>>(new Set());
  const [completingCheckin, setCompletingCheckin] = useState(false);
  const sessionResumeTried = useRef(false);

  // Identity resolved by OTP/session lookup — needed to price the walk-in's
  // General Attendance tile the same way the register flow would (member vs
  // guest price) and to link a walk-in registration to the member record.
  const [isMember, setIsMember] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [familyMembers, setFamilyMembers] = useState<{ name: string; age: string }[]>([]);

  // "Add walk-in" — grows the General Attendance headcount on this
  // registration without going through the full register flow again.
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInIsParticipant, setWalkInIsParticipant] = useState(false);
  const [walkInError, setWalkInError] = useState('');
  const [walkInSaving, setWalkInSaving] = useState(false);

  // "Check in as a walk-in" — for someone with NO prior registration at all
  // (the not_found step). Shows the same General Attendance tile UI as the
  // register flow (named roster + price), then a payment step if the tile
  // isn't free, and creates+checks-in a brand-new registration on submit.
  // Distinct from addWalkIn above, which only grows an existing one.
  const gaItem = items.find((i) => i.enabled && i.isGeneralAttendance);
  const [newWalkInParticipants, setNewWalkInParticipants] = useState<{ name: string; age: string; isParticipant: boolean }[]>([{ name: '', age: '', isParticipant: false }]);
  const [newWalkInParticipantErrors, setNewWalkInParticipantErrors] = useState<Record<number, { name?: string | null; age?: string | null }>>({});
  const [newWalkInError, setNewWalkInError] = useState('');
  const [newWalkInSaving, setNewWalkInSaving] = useState(false);

  const filledWalkInParticipants = newWalkInParticipants.filter((p) => p.name.trim());
  const walkInUnitPrice = gaItem ? (isMember ? gaItem.memberPrice : gaItem.guestPrice) : 0;
  const walkInQuantity = Math.max(1, filledWalkInParticipants.length);
  const walkInTotal = gaItem ? (gaItem.pricingMode === 'flat' ? walkInUnitPrice : walkInUnitPrice * walkInQuantity) : 0;

  // Picked on the renewal_required step — an expired member must renew
  // before check-in (new or existing) can proceed. No combined cart here
  // (unlike registration) — check-in never adds a new event cost for an
  // already-paid registration, so this is a renewal-only payment.
  const [selectedMembershipType, setSelectedMembershipType] = useState<MembershipTypeConfig | null>(null);
  const [pendingAfterRenewal, setPendingAfterRenewal] = useState<LookupData | null>(null);
  // The just-captured renewal payment, not yet applied server-side — carried
  // into whichever action comes next (a participant's check-in, or a
  // brand-new walk-in registration), since those are the OTP-aware
  // endpoints that can actually apply it (unlike /api/members/renew, which
  // requires a real NextAuth session check-in never has). Cleared the
  // moment one of those calls succeeds — the member's status is Active in
  // the DB by then, so there's nothing left to apply.
  const [pendingMembershipRenewal, setPendingMembershipRenewal] = useState<{ membershipType: string; amount: string; paymentMethod: string; transactionId: string } | null>(null);

  const continueAfterLookup = (data: LookupData) => {
    if (!data.existingRegistration || data.existingRegistration.registrationStatus === 'cancelled') {
      setStep('not_found');
      return;
    }
    setRegistration(data.existingRegistration);
    setSelectedForCheckin(new Set());
    setStep('checkin');
  };

  const applyLookup = (data: LookupData) => {
    setIsMember(!!data.isMember);
    setMemberId(data.memberId || '');
    setFamilyMembers(data.familyMembers || []);

    // An expired member is never a guest (see event-items.service.ts) —
    // gate here, on page load, before check-in (new or existing) can proceed.
    if (data.requiresRenewal) {
      // Settings names the tier "Family Membership" etc. while Member.membershipLevel
      // stores the bare level ("Family") — match on prefix rather than equality.
      const level = (data.currentMembershipLevel || '').toLowerCase();
      const match = level ? membershipTypes.find((t) => t.name.toLowerCase().startsWith(level)) : undefined;
      setSelectedMembershipType(match || membershipTypes[0] || null);
      setPendingAfterRenewal(data);
      setStep('renewal_required');
      return;
    }

    continueAfterLookup(data);
  };

  const handleRenewalPaymentSuccess = (result: { method: 'square' | 'paypal' | 'zelle'; transactionId: string }) => {
    if (!selectedMembershipType || !pendingAfterRenewal) return;
    setPendingMembershipRenewal({
      membershipType: selectedMembershipType.name,
      amount: String(selectedMembershipType.price),
      paymentMethod: result.method,
      transactionId: result.transactionId,
    });
    continueAfterLookup(pendingAfterRenewal);
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
          body: JSON.stringify({ action: 'session', forCheckin: true }),
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
        body: JSON.stringify({ action: 'verify', email: email.trim(), code: otpCode.trim(), forCheckin: true }),
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

  const toggleSelectedForCheckin = (participantId: string) => {
    setSelectedForCheckin((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const handleCompleteCheckin = async () => {
    if (!registration || selectedForCheckin.size === 0) return;
    const participantIds = Array.from(selectedForCheckin);
    setCompletingCheckin(true);
    try {
      const res = await fetchWithTimeout(`/api/events/${eventId}/items-registrations/${registration.id}/checkin-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantIds,
          ...(pendingMembershipRenewal ? { membershipRenewal: pendingMembershipRenewal } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        const checkedIn = json.data.checkedIn as { id: string; checkedInAt: string }[];
        const failed = json.data.failed as { participantId: string; error: string }[];
        const checkedInById = new Map(checkedIn.map((p) => [p.id, p.checkedInAt]));
        setRegistration((r) => r && ({
          ...r,
          participants: r.participants.map((p) => (checkedInById.has(p.id) ? { ...p, checkedInAt: checkedInById.get(p.id)! } : p)),
        }));
        if (failed.length > 0) {
          toast.error(`${checkedIn.length} checked in, ${failed.length} failed`);
        } else {
          toast.success(checkedIn.length === 1 ? 'Checked in' : `${checkedIn.length} checked in`);
        }
        // Keep failed ids selected so the front desk can retry just those;
        // drop everything that actually succeeded.
        setSelectedForCheckin(new Set(failed.map((f) => f.participantId)));
        // Applied server-side as part of the call above — the member's
        // status is Active now, so nothing left to carry into later calls.
        setPendingMembershipRenewal(null);
      } else {
        toast.error(json.error || 'Failed to check in');
      }
    } catch {
      toast.error('Failed to check in');
    } finally {
      setCompletingCheckin(false);
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
      const res = await fetchWithTimeout(`/api/events/${eventId}/items-registrations/${registration.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: walkInName.trim(),
          age: walkInAge.trim(),
          isParticipant: walkInIsParticipant,
          ...(pendingMembershipRenewal ? { membershipRenewal: pendingMembershipRenewal } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${terminology.participantNoun} added`);
        setRegistration((r) => r && ({ ...r, participants: [...r.participants, json.data.participant] }));
        setWalkInName('');
        setWalkInAge('');
        setWalkInIsParticipant(false);
        setAddingWalkIn(false);
        setPendingMembershipRenewal(null);
      } else {
        setWalkInError(json.error || `Failed to add ${terminology.participantNoun.toLowerCase()}`);
      }
    } catch {
      setWalkInError(`Failed to add ${terminology.participantNoun.toLowerCase()}`);
    } finally {
      setWalkInSaving(false);
    }
  };

  // Validates the roster, then either submits directly (free tile) or hands
  // off to the payment step — mirrors handleContinueFromItems in the
  // register flow's GA tile.
  const handleContinueFromWalkIn = () => {
    setNewWalkInError('');
    const newErrors: Record<number, { name?: string | null; age?: string | null }> = {};
    let hasError = false;
    newWalkInParticipants.forEach((p, i) => {
      const nErr = validateNameRequired(p.name);
      const aErr = validateAgeRequired(p.age);
      if (nErr || aErr) hasError = true;
      newErrors[i] = { name: nErr, age: aErr };
    });
    setNewWalkInParticipantErrors(newErrors);
    if (hasError) return;

    if (walkInTotal > 0) {
      setStep('walkin_payment');
    } else {
      submitWalkInCheckin({ paymentStatus: 'paid', paymentMethod: 'free', transactionId: '' });
    }
  };

  const submitWalkInCheckin = async (payment: { paymentStatus: string; paymentMethod: string; transactionId: string }) => {
    setNewWalkInError('');
    setNewWalkInSaving(true);
    const isPaid = !!payment.transactionId;
    addPaymentFlowBreadcrumb('walk-in checkin save started', { eventId, paymentMethod: payment.paymentMethod, transactionId: payment.transactionId });
    try {
      const res = await fetchWithTimeout(`/api/events/${eventId}/items-registrations/walkin-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          memberId: isMember ? memberId : '',
          participants: filledWalkInParticipants,
          ...payment,
          ...(pendingMembershipRenewal ? { membershipRenewal: pendingMembershipRenewal } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        addPaymentFlowBreadcrumb('walk-in checkin save succeeded', { eventId, transactionId: payment.transactionId });
        toast.success('Checked in');
        setRegistration(json.data);
        setStep('checkin');
        setPendingMembershipRenewal(null);
      } else {
        // Payment already captured (isPaid) but the check-in/registration
        // save failed — the money-at-risk case worth reporting.
        if (isPaid) {
          capturePaymentFlowError(new Error(json.error || 'Failed to check in'), {
            context: 'Walk-in checkin save failed after payment', eventId, paymentMethod: payment.paymentMethod, transactionId: payment.transactionId,
          });
        }
        setNewWalkInError(json.error || 'Failed to check in');
        setStep('not_found');
      }
    } catch (err) {
      if (isPaid) {
        capturePaymentFlowError(err, {
          context: 'Walk-in checkin save request failed after payment', eventId, paymentMethod: payment.paymentMethod, transactionId: payment.transactionId,
        });
      }
      setNewWalkInError('Failed to check in. Please try again.');
      setStep('not_found');
    } finally {
      setNewWalkInSaving(false);
    }
  };

  const registrationPaymentProviders: ('paypal' | 'zelle')[] = [
    ...(paymentConfig.paypalEnabled ? (['paypal'] as const) : []),
    ...(paymentConfig.zelleEnabled ? (['zelle'] as const) : []),
  ];

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

      {step === 'renewal_required' && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <HiOutlineShieldCheck className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Your Membership Has Expired</h2>
            <p className="text-sm text-slate-500 mt-1">You need to renew your membership in order to check in.</p>
          </div>
          {selectedMembershipType && (
            <PaymentForm
              amount={selectedMembershipType.price}
              eventId="membership-renewal"
              eventName={`${selectedMembershipType.name} Membership Renewal`}
              payerName={email}
              payerEmail={email}
              onSuccess={handleRenewalPaymentSuccess}
              onCancel={() => setStep('identify')}
              paypalFeePercent={paymentConfig.paypalFeePercent ?? feeSettings?.paypalFeePercent}
              paypalFeeFixed={paymentConfig.paypalFeeFixed ?? feeSettings?.paypalFeeFixed}
              zelleEmail={feeSettings?.zelleEmail}
              zellePhone={feeSettings?.zellePhone}
              providers={registrationPaymentProviders}
            />
          )}
        </div>
      )}

      {step === 'not_found' && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-sm text-slate-700">We couldn&apos;t find a registration for {email} at this event.</p>
            <p className="text-xs text-slate-500 mt-1">Walking in without registering ahead of time? Fill in who&apos;s attending below and we&apos;ll check you in now.</p>
          </div>

          {/* Same "Who's attending?" tile the register flow uses for its
              General Attendance item — same roster UI, same per-person
              pricing, so a walk-in checked in here is priced identically to
              someone who pre-registered. */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{gaItem?.name || 'Attendance'}</p>
              {walkInUnitPrice > 0 && gaItem?.pricingMode === 'flat' && (
                <span className="font-mono tabular-nums text-sm text-slate-900 shrink-0">{formatCurrency(walkInUnitPrice)}</span>
              )}
            </div>
            {walkInUnitPrice > 0 && gaItem?.pricingMode !== 'flat' && (
              <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(walkInUnitPrice)} per person</p>
            )}
            <div className="mt-3 pl-3 border-l-2 border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Who&apos;s attending?</p>
                {isMember && familyMembers.length > 0 && (
                  <button
                    onClick={() => setNewWalkInParticipants([{ name: '', age: '', isParticipant: false }, ...familyMembers.map((m) => ({ ...m, isParticipant: false }))])}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    Use Family from Profile
                  </button>
                )}
              </div>
              {newWalkInParticipants.map((p, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => {
                        setNewWalkInParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
                        setNewWalkInParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], name: null } }));
                      }}
                      onBlur={() => setNewWalkInParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], name: validateNameRequired(p.name) } }))}
                      className={`input flex-1 ${newWalkInParticipantErrors[i]?.name ? 'border-red-500' : ''}`}
                      placeholder={`${terminology.participantNoun} name`}
                      autoFocus={i === 0}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={p.age}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setNewWalkInParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, age: digits } : x)));
                        setNewWalkInParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], age: null } }));
                      }}
                      onBlur={() => setNewWalkInParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], age: validateAgeRequired(p.age) } }))}
                      className={`input w-20 ${newWalkInParticipantErrors[i]?.age ? 'border-red-500' : ''}`}
                      placeholder="Age"
                    />
                    {newWalkInParticipants.length > 1 && (
                      <button onClick={() => setNewWalkInParticipants((ps) => ps.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`attendance-role-${i}`}
                        checked={!p.isParticipant}
                        onChange={() => setNewWalkInParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, isParticipant: false } : x)))}
                      />
                      <span className="text-xs text-slate-500">Attendee</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`attendance-role-${i}`}
                        checked={p.isParticipant}
                        onChange={() => setNewWalkInParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, isParticipant: true } : x)))}
                      />
                      <span className="text-xs text-slate-500">Participant</span>
                    </label>
                  </div>
                  <FieldError error={newWalkInParticipantErrors[i]?.name || newWalkInParticipantErrors[i]?.age} />
                </div>
              ))}
              <button onClick={() => setNewWalkInParticipants((ps) => [...ps, { name: '', age: '', isParticipant: false }])} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                <HiOutlinePlus className="w-4 h-4" /> Add Another {terminology.participantNoun}
              </button>
            </div>
            {walkInTotal > 0 && (
              <p className="text-xs font-mono tabular-nums font-semibold text-slate-700 mt-3 pt-3 border-t border-slate-100">
                Total: {formatCurrency(walkInTotal)}
              </p>
            )}
          </div>

          {newWalkInError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{newWalkInError}</p>}
          <button onClick={handleContinueFromWalkIn} disabled={newWalkInSaving} className="btn-primary w-full">
            {newWalkInSaving ? 'Checking in…' : walkInTotal > 0 ? 'Continue to Payment' : 'Check In as Walk-in'}
          </button>
          <button onClick={() => { setStep('identify'); setEmail(''); setNewWalkInError(''); }} className="text-xs text-slate-500 hover:text-slate-700 w-full text-center">
            ← Use a different email
          </button>
        </div>
      )}

      {step === 'walkin_payment' && (
        <div className="space-y-3">
          <button onClick={() => setStep('not_found')} className="btn-secondary text-sm">← Back</button>
          <PaymentForm
            amount={walkInTotal}
            eventId={eventId}
            eventName={event.name}
            payerName={filledWalkInParticipants[0]?.name || ''}
            payerEmail={email}
            onSuccess={(result) => {
              submitWalkInCheckin({
                paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
                paymentMethod: result.method,
                transactionId: result.transactionId,
              });
            }}
            onCancel={() => setStep('not_found')}
            paypalFeePercent={paymentConfig.paypalFeePercent ?? feeSettings?.paypalFeePercent}
            paypalFeeFixed={paymentConfig.paypalFeeFixed ?? feeSettings?.paypalFeeFixed}
            zelleEmail={feeSettings?.zelleEmail}
            zellePhone={feeSettings?.zellePhone}
            providers={registrationPaymentProviders}
          />
        </div>
      )}

      {step === 'checkin' && registration && (() => {
        const total = registration.participants.length;
        const checkedInCount = registration.participants.filter((p) => !!p.checkedInAt).length;
        const allCheckedIn = total > 0 && checkedInCount === total;
        const noun = total !== 1 ? terminology.participantNounPlural.toLowerCase() : terminology.participantNoun.toLowerCase();
        return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className={`px-4 py-3 border-b border-dashed ${allCheckedIn ? 'bg-green-50 border-green-200' : 'border-slate-200'}`}>
            <p className="text-sm font-semibold text-slate-900">{registration.contactName}</p>
            <p className={`text-[11px] font-mono tabular-nums uppercase tracking-wide mt-0.5 ${allCheckedIn ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
              {allCheckedIn ? `✓ All ${total} ${noun} checked in` : `${checkedInCount} of ${total} ${noun} checked in`}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {registration.participants.length === 0 && (
              <p className="text-xs text-slate-500 px-4 py-3">No named attendees on this {terminology.registrationNoun.toLowerCase()}.</p>
            )}
            {registration.participants.map((p) => {
              const selected = selectedForCheckin.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => !p.checkedInAt && toggleSelectedForCheckin(p.id)}
                  className={`flex items-center gap-3 px-4 py-3 ${p.checkedInAt ? 'bg-slate-50' : 'cursor-pointer'} ${selected ? 'bg-primary-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${p.checkedInAt ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {p.name}{p.age ? ` (${p.age})` : ''}
                      {p.isParticipant === 'true' && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">Participant</span>
                      )}
                    </p>
                    {p.checkedInAt && <p className="text-[11px] text-green-600 font-mono tabular-nums mt-0.5">Checked in</p>}
                  </div>
                  {p.checkedInAt ? (
                    <div className="w-9 h-9 rounded-lg bg-green-500 text-white flex items-center justify-center shrink-0">
                      <HiOutlineCheckCircle className="w-5 h-5" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectedForCheckin(p.id);
                      }}
                      aria-pressed={selected}
                      aria-label={selected ? `Deselect ${p.name}` : `Select ${p.name}`}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        selected ? 'bg-green-500 text-white' : 'border-2 border-red-200 text-red-500 bg-white'
                      }`}
                    >
                      {selected ? <HiOutlineCheckCircle className="w-5 h-5" /> : <HiOutlineMinusCircle className="w-5 h-5" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedForCheckin.size > 0 && (
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={handleCompleteCheckin}
                disabled={completingCheckin}
                className="btn-primary w-full disabled:opacity-50"
              >
                {completingCheckin ? 'Checking in…' : `Complete Check-In (${selectedForCheckin.size})`}
              </button>
            </div>
          )}
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
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="walkin-attendance-role" checked={!walkInIsParticipant} onChange={() => setWalkInIsParticipant(false)} />
                    <span className="text-xs text-slate-500">Attendee</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="walkin-attendance-role" checked={walkInIsParticipant} onChange={() => setWalkInIsParticipant(true)} />
                    <span className="text-xs text-slate-500">Participant</span>
                  </label>
                </div>
                {walkInError && <p className="text-xs text-red-600">{walkInError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleAddWalkIn} disabled={walkInSaving} className="btn-primary text-sm px-3 py-1.5">
                    {walkInSaving ? 'Adding…' : 'Add'}
                  </button>
                  <button onClick={() => { setAddingWalkIn(false); setWalkInName(''); setWalkInAge(''); setWalkInIsParticipant(false); setWalkInError(''); }} className="btn-secondary text-sm px-3 py-1.5">
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
        );
      })()}
      </div>
      <EventBottomNav
        eventId={eventId}
        active="checkin"
        eventDate={event.date}
        registerLabel={terminology.registerCta}
        checkinLabel={terminology.checkinCta}
      />
    </PublicLayout>
  );
}
