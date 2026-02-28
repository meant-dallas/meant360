'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import PublicLayout from '@/components/events/PublicLayout';
import PriceDisplay from '@/components/events/PriceDisplay';
import PaymentForm from '@/components/events/PaymentForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { parsePricingRules, calculatePrice } from '@/lib/pricing';
import { validateEmail, validateEmailRequired, validatePhone, validateNameRequired } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import type { PricingRules, PriceBreakdown, FeeSettings } from '@/types';
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineHeart } from 'react-icons/hi2';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

type Step =
  | 'loading'
  | 'lookup'
  | 'looking_up'
  | 'already_checked_in'
  | 'member_active'
  | 'member_expired'
  | 'membership_offer'
  | 'guest_form'
  | 'payment'
  | 'checking_in'
  | 'success'
  | 'error';

interface LookupResult {
  status: string;
  memberId?: string;
  guestId?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  referredBy?: string;
  memberStatus?: string;
  checkedInAt?: string;
  siblingEventRegCount?: number;
}

function CheckinContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;

  const [step, setStep] = useState<Step>('loading');
  const [eventName, setEventName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [checkedInTime, setCheckedInTime] = useState('');
  const [adults, setAdults] = useState(1);
  const [freeKids, setFreeKids] = useState(0);
  const [paidKids, setPaidKids] = useState(0);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [regType, setRegType] = useState<'Member' | 'Guest'>('Guest');
  const [siblingEventRegCount, setSiblingEventRegCount] = useState(0);

  const [paymentInfo, setPaymentInfo] = useState<{
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
  }>({ paymentStatus: '', paymentMethod: '', transactionId: '' });
  const [pendingCheckinType, setPendingCheckinType] = useState<'Member' | 'Guest'>('Guest');

  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    referredBy: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  // Fetch fee settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/public');
        const json = await res.json();
        if (json.success && json.data?.feeSettings) {
          setFeeSettings(json.data.feeSettings);
        }
      } catch {
        // Fee settings are optional
      }
    })();
  }, []);

  // Recalculate price when inputs change
  useEffect(() => {
    if (pricingRules && pricingRules.enabled) {
      const breakdown = calculatePrice({
        pricingRules,
        type: regType,
        adults,
        freeKids,
        paidKids,
        otherSubEventCount: siblingEventRegCount,
      });
      setPriceBreakdown(breakdown);
    } else {
      setPriceBreakdown(null);
    }
  }, [pricingRules, regType, adults, freeKids, paidKids, siblingEventRegCount]);

  const handleLookup = useCallback(async (email?: string) => {
    const emailToUse = email || lookupEmail.trim();
    if (!emailToUse) return;
    const emailErr = validateEmailRequired(emailToUse);
    if (emailErr) { setFieldErrors((e) => ({ ...e, lookupEmail: emailErr })); return; }
    setFieldErrors((e) => ({ ...e, lookupEmail: null }));
    setStep('looking_up');
    try {
      const res = await fetch(`/api/events/${eventId}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, phone: lookupPhone.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error || 'Lookup failed');
        setStep('error');
        return;
      }

      const data = json.data as LookupResult;
      setLookupResult(data);
      setSiblingEventRegCount(data.siblingEventRegCount || 0);

      switch (data.status) {
        case 'already_checked_in':
          setCheckedInTime(data.checkedInAt || '');
          setForm((f) => ({ ...f, name: data.name || '' }));
          setStep('already_checked_in');
          break;

        case 'member_active':
          setRegType('Member');
          setForm((f) => ({
            ...f,
            name: data.name || '',
            email: data.email || emailToUse,
            phone: data.phone || lookupPhone.trim(),
          }));
          setStep('member_active');
          break;

        case 'member_expired':
          setRegType('Guest');
          setForm((f) => ({
            ...f,
            name: data.name || '',
            email: data.email || emailToUse,
            phone: lookupPhone.trim(),
          }));
          setStep('member_expired');
          break;

        case 'returning_guest':
          setRegType('Guest');
          setForm({
            name: data.name || '',
            email: data.email || emailToUse,
            phone: data.phone || lookupPhone.trim(),
            city: data.city || '',
            referredBy: data.referredBy || '',
          });
          setStep('membership_offer');
          break;

        case 'not_found':
        default:
          setRegType('Guest');
          setForm((f) => ({
            ...f,
            email: emailToUse,
            phone: lookupPhone.trim(),
          }));
          setStep('membership_offer');
          break;
      }
    } catch {
      setErrorMsg('Lookup failed.');
      setStep('error');
    }
  }, [eventId, lookupEmail, lookupPhone]);

  // Fetch event info on mount and handle ?email= query param
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`);
        const json = await res.json();
        if (json.success) {
          setEventName(json.data.name);
          if (json.data.pricingRules) {
            setPricingRules(parsePricingRules(json.data.pricingRules));
          }
          if (json.data.status === 'Cancelled') {
            setErrorMsg('This event has been cancelled.');
            setStep('error');
            return;
          }

          // Check for ?email= query param (from tablet flow)
          const prefillEmail = searchParams.get('email');
          if (prefillEmail) {
            setLookupEmail(prefillEmail);
            setStep('lookup');
            // Auto-trigger lookup after a tick
            setTimeout(() => {
              handleLookup(prefillEmail);
            }, 100);
          } else {
            setStep('lookup');
          }
        } else {
          setErrorMsg('Event not found.');
          setStep('error');
        }
      } catch {
        setErrorMsg('Failed to load event.');
        setStep('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, searchParams]);

  const submitCheckin = async (
    type: 'Member' | 'Guest',
    payment: { paymentStatus: string; paymentMethod: string; transactionId: string },
  ) => {
    setStep('checking_in');
    try {
      const res = await fetch(`/api/events/${eventId}/checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          memberId: lookupResult?.memberId || '',
          guestId: lookupResult?.guestId || '',
          name: form.name,
          email: form.email || lookupEmail.trim(),
          phone: form.phone || lookupPhone.trim(),
          city: form.city,
          referredBy: form.referredBy,
          adults,
          kids: freeKids + paidKids,
          totalPrice: priceBreakdown ? String(priceBreakdown.total) : '0',
          priceBreakdown: priceBreakdown ? JSON.stringify(priceBreakdown) : '',
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.data.alreadyCheckedIn) {
          setCheckedInTime(json.data.checkedInAt);
          setStep('already_checked_in');
        } else {
          setPaymentInfo(payment);
          setCheckedInTime(json.data.checkedInAt || new Date().toISOString());
          setStep('success');
        }
      } else {
        setErrorMsg(json.error || 'Check-in failed.');
        setStep('error');
      }
    } catch {
      setErrorMsg('Check-in failed.');
      setStep('error');
    }
  };

  const validateGuestForm = (): boolean => {
    const errors: Record<string, string | null> = {};
    errors.name = validateNameRequired(form.name);
    errors.email = validateEmail(form.email);
    errors.phone = validatePhone(form.phone);
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return !errors.name && !errors.email && !errors.phone;
  };

  const doCheckin = async (type: 'Member' | 'Guest') => {
    if (type === 'Guest' && !validateGuestForm()) return;
    const total = priceBreakdown?.total || 0;
    if (PAYMENTS_ENABLED && total > 0) {
      setPendingCheckinType(type);
      setStep('payment');
      return;
    }
    await submitCheckin(type, { paymentStatus: '', paymentMethod: '', transactionId: '' });
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const isFamilyMember = regType === 'Member' && pricingRules?.memberPricingModel === 'family';
  const kidFreeAge = regType === 'Member' ? (pricingRules?.memberKidFreeUnderAge ?? 5) : (pricingRules?.guestKidFreeUnderAge ?? 5);
  const kidMaxAge = regType === 'Member' ? (pricingRules?.memberKidMaxAge ?? 17) : (pricingRules?.guestKidMaxAge ?? 17);

  const AdultsKidsInputs = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Adults</label>
          <input
            type="number"
            min={0}
            value={adults}
            onChange={(e) => setAdults(Math.max(0, parseInt(e.target.value) || 0))}
            className="input"
          />
        </div>
        {isFamilyMember ? (
          <div>
            <label className="label">Kids</label>
            <input
              type="number"
              min={0}
              value={freeKids}
              onChange={(e) => { setFreeKids(Math.max(0, parseInt(e.target.value) || 0)); setPaidKids(0); }}
              className="input"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Kids {kidFreeAge} and under (free)</label>
              <input
                type="number"
                min={0}
                value={freeKids}
                onChange={(e) => setFreeKids(Math.max(0, parseInt(e.target.value) || 0))}
                className="input"
              />
            </div>
          </>
        )}
      </div>
      {!isFamilyMember && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kids age {kidFreeAge + 1}–{kidMaxAge}</label>
            <input
              type="number"
              min={0}
              value={paidKids}
              onChange={(e) => setPaidKids(Math.max(0, parseInt(e.target.value) || 0))}
              className="input"
            />
          </div>
        </div>
      )}
      {isFamilyMember && pricingRules && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Flat family price — ${pricingRules.memberFamilyPrice}
        </p>
      )}
    </div>
  );

  return (
    <PublicLayout eventName={eventName}>
      {/* Loading */}
      {step === 'loading' && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="card p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          <button onClick={() => { setErrorMsg(''); setStep('lookup'); }} className="mt-4 btn-secondary">
            Try Again
          </button>
        </div>
      )}

      {/* Step: Lookup */}
      {step === 'lookup' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Event Check-in</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter your details to check in.</p>
          <div className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={lookupEmail}
                onChange={(e) => { setLookupEmail(e.target.value); setFieldErrors((fe) => ({ ...fe, lookupEmail: null })); }}
                onBlur={() => { if (lookupEmail.trim()) setFieldErrors((fe) => ({ ...fe, lookupEmail: validateEmailRequired(lookupEmail) })); }}
                className={`input ${fieldErrors.lookupEmail ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <FieldError error={fieldErrors.lookupEmail} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                value={lookupPhone}
                onChange={(e) => { setLookupPhone(e.target.value); setFieldErrors((fe) => ({ ...fe, lookupPhone: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, lookupPhone: validatePhone(lookupPhone) }))}
                className={`input ${fieldErrors.lookupPhone ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="(555) 123-4567"
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <FieldError error={fieldErrors.lookupPhone} />
            </div>
            <button onClick={() => handleLookup()} disabled={!lookupEmail.trim() || !!fieldErrors.lookupEmail || !!fieldErrors.lookupPhone} className="btn-primary w-full">
              Find My Registration
            </button>
          </div>
        </div>
      )}

      {/* Step: Looking up */}
      {step === 'looking_up' && (
        <div className="card p-6 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Looking you up...</p>
        </div>
      )}

      {/* Step: Already checked in */}
      {step === 'already_checked_in' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Already Checked In</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{form.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Checked in at {formatTime(checkedInTime)}</p>
        </div>
      )}

      {/* Step: Active member */}
      {step === 'member_active' && (
        <div className="card p-6">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Welcome, {form.name}!</h2>
            <div className="mb-2">
              <StatusBadge status="Active" className="text-sm" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Active Member</p>
          </div>
          <div className="space-y-3">
            <AdultsKidsInputs />
            {priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
            <button onClick={() => doCheckin('Member')} className="btn-primary w-full">
              Check In
            </button>
          </div>
        </div>
      )}

      {/* Step: Expired member */}
      {step === 'member_expired' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {form.name}, your membership is {lookupResult?.memberStatus}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-4">
            You can still check in as a guest.
          </p>
          <button
            onClick={() => {
              setForm((f) => ({ ...f, email: lookupEmail.trim(), phone: lookupPhone.trim() }));
              setStep('membership_offer');
            }}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Membership offer */}
      {step === 'membership_offer' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineHeart className="w-7 h-7 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Interested in becoming a member?
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Members enjoy benefits at all our events. Talk to the registration desk to learn more!
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setStep('guest_form');
              }}
              className="btn-primary w-full"
            >
              Yes, I&apos;ll talk to the registration desk
            </button>
            <button
              onClick={() => setStep('guest_form')}
              className="btn-secondary w-full"
            >
              No thanks, continue as guest
            </button>
          </div>
        </div>
      )}

      {/* Step: Guest form */}
      {step === 'guest_form' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Guest Check-in</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Please fill in your details.</p>
          <form onSubmit={(e) => { e.preventDefault(); doCheckin('Guest'); }} className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((fe) => ({ ...fe, name: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, name: validateNameRequired(form.name) }))}
                className={`input ${fieldErrors.name ? 'border-red-500 dark:border-red-500' : ''}`}
                required
                autoFocus
              />
              <FieldError error={fieldErrors.name} />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((fe) => ({ ...fe, email: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, email: validateEmail(form.email) }))}
                className={`input ${fieldErrors.email ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.email} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors((fe) => ({ ...fe, phone: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, phone: validatePhone(form.phone) }))}
                className={`input ${fieldErrors.phone ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.phone} />
            </div>
            <div>
              <label className="label">City</label>
              <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Referred By</label>
              <input type="text" value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })} className="input" />
            </div>
            <AdultsKidsInputs />
            {priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
            <button type="submit" disabled={!form.name.trim() || !!fieldErrors.name || !!fieldErrors.email || !!fieldErrors.phone} className="btn-primary w-full mt-2">
              Check In
            </button>
          </form>
        </div>
      )}

      {/* Step: Payment */}
      {step === 'payment' && priceBreakdown && (
        <PaymentForm
          amount={priceBreakdown.total}
          eventName={eventName}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={(result) => {
            submitCheckin(pendingCheckinType, {
              paymentStatus: 'paid',
              paymentMethod: result.method,
              transactionId: result.transactionId,
            });
          }}
          onCancel={() => {
            submitCheckin(pendingCheckinType, {
              paymentStatus: '',
              paymentMethod: '',
              transactionId: '',
            });
          }}
          squareFeePercent={feeSettings?.squareFeePercent}
          squareFeeFixed={feeSettings?.squareFeeFixed}
          paypalFeePercent={feeSettings?.paypalFeePercent}
          paypalFeeFixed={feeSettings?.paypalFeeFixed}
        />
      )}

      {/* Step: Checking in */}
      {step === 'checking_in' && (
        <div className="card p-6 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Checking you in...</p>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="card p-6 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineCheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">You&apos;re In!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{form.name}</p>
          {paymentInfo.transactionId && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
              Payment confirmed ({paymentInfo.paymentMethod}) — {paymentInfo.transactionId}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatTime(checkedInTime)}</p>
        </div>
      )}
    </PublicLayout>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckinContent />
    </Suspense>
  );
}
