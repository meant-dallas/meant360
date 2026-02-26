'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PublicLayout from '@/components/events/PublicLayout';
import PriceDisplay from '@/components/events/PriceDisplay';
import PaymentForm from '@/components/events/PaymentForm';
import StatusBadge from '@/components/ui/StatusBadge';
import { parsePricingRules, calculatePrice } from '@/lib/pricing';
import type { PricingRules, PriceBreakdown, FeeSettings } from '@/types';
import { HiOutlineCheckCircle, HiOutlineHeart } from 'react-icons/hi2';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

type Step = 'loading' | 'identify' | 'member_confirm' | 'membership_offer' | 'guest_form' | 'payment' | 'submitting' | 'success' | 'error';

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
  siblingEventRegCount?: number;
}

export default function RegisterPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [step, setStep] = useState<Step>('loading');
  const [eventName, setEventName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [regType, setRegType] = useState<'Member' | 'Guest'>('Guest');
  const [siblingEventRegCount, setSiblingEventRegCount] = useState(0);

  const [paymentInfo, setPaymentInfo] = useState<{
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
  }>({ paymentStatus: '', paymentMethod: '', transactionId: '' });
  const [pendingRegType, setPendingRegType] = useState<'Member' | 'Guest'>('Guest');

  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    referredBy: '',
  });

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

  // Fetch event info
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
          if (json.data.status !== 'Upcoming') {
            setErrorMsg('This event is not open for registration.');
            setStep('error');
            return;
          }
          setStep('identify');
        } else {
          setErrorMsg('Event not found.');
          setStep('error');
        }
      } catch {
        setErrorMsg('Failed to load event.');
        setStep('error');
      }
    })();
  }, [eventId]);

  // Recalculate price when inputs change
  useEffect(() => {
    if (pricingRules && pricingRules.enabled) {
      const breakdown = calculatePrice({
        pricingRules,
        type: regType,
        adults,
        kids,
        otherSubEventCount: siblingEventRegCount,
      });
      setPriceBreakdown(breakdown);
    } else {
      setPriceBreakdown(null);
    }
  }, [pricingRules, regType, adults, kids, siblingEventRegCount]);

  const handleLookup = async () => {
    if (!lookupEmail.trim()) return;
    try {
      const res = await fetch(`/api/events/${eventId}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lookupEmail.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setErrorMsg(json.error); setStep('error'); return; }

      const data = json.data as LookupResult;
      setLookupResult(data);
      setSiblingEventRegCount(data.siblingEventRegCount || 0);

      if (data.status === 'already_checked_in') {
        // Already checked in implies registered — show success-like state
        setForm((f) => ({ ...f, name: data.name || '' }));
        setStep('success');
        return;
      }

      if (data.status === 'member_active' || data.status === 'member_expired') {
        setRegType('Member');
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || lookupEmail.trim(),
          phone: data.phone || '',
        }));
        setStep('member_confirm');
        return;
      }

      if (data.status === 'returning_guest') {
        setRegType('Guest');
        setForm({
          name: data.name || '',
          email: data.email || lookupEmail.trim(),
          phone: data.phone || '',
          city: data.city || '',
          referredBy: data.referredBy || '',
        });
        setStep('membership_offer');
        return;
      }

      // not_found
      setRegType('Guest');
      setForm((f) => ({ ...f, email: lookupEmail.trim() }));
      setStep('membership_offer');
    } catch {
      setErrorMsg('Lookup failed.');
      setStep('error');
    }
  };

  const submitRegistration = async (
    type: 'Member' | 'Guest',
    payment: { paymentStatus: string; paymentMethod: string; transactionId: string },
  ) => {
    setStep('submitting');
    try {
      const res = await fetch(`/api/events/${eventId}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          memberId: lookupResult?.memberId || '',
          guestId: lookupResult?.guestId || '',
          name: form.name,
          email: form.email || lookupEmail.trim(),
          phone: form.phone,
          city: form.city,
          referredBy: form.referredBy,
          adults,
          kids,
          totalPrice: priceBreakdown ? String(priceBreakdown.total) : '0',
          priceBreakdown: priceBreakdown ? JSON.stringify(priceBreakdown) : '',
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPaymentInfo(payment);
        setStep('success');
      } else {
        setErrorMsg(json.error || 'Registration failed.');
        setStep('error');
      }
    } catch {
      setErrorMsg('Registration failed.');
      setStep('error');
    }
  };

  const handleRegister = async (type: 'Member' | 'Guest') => {
    const total = priceBreakdown?.total || 0;
    if (PAYMENTS_ENABLED && total > 0) {
      setPendingRegType(type);
      setStep('payment');
      return;
    }
    await submitRegistration(type, { paymentStatus: '', paymentMethod: '', transactionId: '' });
  };

  const AdultsKidsInputs = () => (
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
      <div>
        <label className="label">Kids</label>
        <input
          type="number"
          min={0}
          value={kids}
          onChange={(e) => setKids(Math.max(0, parseInt(e.target.value) || 0))}
          className="input"
        />
      </div>
    </div>
  );

  return (
    <PublicLayout eventName={eventName}>
      {step === 'loading' && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {step === 'error' && (
        <div className="card p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          <button onClick={() => { setErrorMsg(''); setStep('identify'); }} className="mt-4 btn-secondary">
            Try Again
          </button>
        </div>
      )}

      {step === 'identify' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Register for Event</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter your email to get started.</p>
          <div className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                className="input"
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
            </div>
            <button onClick={handleLookup} disabled={!lookupEmail.trim()} className="btn-primary w-full">
              Look Up
            </button>
          </div>
        </div>
      )}

      {step === 'member_confirm' && lookupResult && (
        <div className="card p-6">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Welcome, {form.name}!</h2>
            <div className="mb-4">
              <StatusBadge status={lookupResult.status === 'member_active' ? 'Active' : (lookupResult.memberStatus || 'Member')} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              We found your membership. Click below to register for this event.
            </p>
          </div>
          <div className="space-y-3">
            <AdultsKidsInputs />
            {priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
            <button onClick={() => handleRegister('Member')} className="btn-primary w-full">
              Register
            </button>
          </div>
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
              onClick={() => setStep('guest_form')}
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

      {step === 'guest_form' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Guest Registration</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Please fill in your details.</p>
          <div className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
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
            <button onClick={() => handleRegister('Guest')} disabled={!form.name.trim()} className="btn-primary w-full mt-2">
              Register
            </button>
          </div>
        </div>
      )}

      {step === 'payment' && priceBreakdown && (
        <PaymentForm
          amount={priceBreakdown.total}
          eventName={eventName}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={(result) => {
            submitRegistration(pendingRegType, {
              paymentStatus: 'paid',
              paymentMethod: result.method,
              transactionId: result.transactionId,
            });
          }}
          onCancel={() => {
            submitRegistration(pendingRegType, {
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

      {step === 'submitting' && (
        <div className="card p-6 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Registering...</p>
        </div>
      )}

      {step === 'success' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Registration Successful!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{form.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{eventName}</p>
          {paymentInfo.transactionId && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
              Payment confirmed ({paymentInfo.paymentMethod}) — {paymentInfo.transactionId}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {new Date().toLocaleString()}
          </p>
        </div>
      )}
    </PublicLayout>
  );
}
