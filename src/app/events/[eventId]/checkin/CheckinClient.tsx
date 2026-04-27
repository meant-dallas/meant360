'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ReadonlyURLSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PublicLayout from '@/components/events/PublicLayout';
import PriceDisplay from '@/components/events/PriceDisplay';
import PaymentForm from '@/components/events/PaymentForm';
import StatusBadge from '@/components/ui/StatusBadge';
import OTPStep from '@/components/events/OTPStep';
import { parsePricingRules, calculatePrice } from '@/lib/pricing';
import { parseGuestPolicy } from '@/lib/event-config';
import { getEventTheme } from '@/lib/event-theme';
import { loadMyProfile, sendCheckinOTP } from '@/lib/event-registration-api';
import { validateEmail, validateEmailRequired, validatePhone, validateNameRequired } from '@/lib/validation';
import { formatPhone, parseLocalDate } from '@/lib/utils';
import FieldError from '@/components/ui/FieldError';
import type { PricingRules, PriceBreakdown, FeeSettings, GuestPolicy } from '@/types';
import type { OTPVerifiedProfile } from '@/types/event-registration';
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineHeart, HiOutlineClock } from 'react-icons/hi2';
import { analytics } from '@/lib/analytics';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

export interface CheckinEventData {
  id: string;
  name: string;
  description: string;
  date: string;
  status: string;
  categoryLogoUrl: string;
  categoryBgColor: string;
  pricingRules: string;
  guestPolicy: string;
  capacityMode: string;
}

export interface CheckinClientProps {
  eventData: CheckinEventData;
  feeSettings: { squareFeePercent: number; squareFeeFixed: number; paypalFeePercent: number; paypalFeeFixed: number; zelleEmail: string; zellePhone: string } | null;
}

type Step =
  | 'loading'
  | 'splash'
  | 'lookup'
  | 'looking_up'
  | 'otp_verify'
  | 'already_checked_in'
  | 'member_active'
  | 'member_expired'
  | 'membership_offer'
  | 'pending_application'
  | 'waitlisted'
  | 'guest_form'
  | 'payment'
  | 'checking_in'
  | 'success'
  | 'error';

interface RegistrationData {
  registeredAdults: number;
  registeredKids: number;
  selectedActivities: string;
  customFields: string;
  totalPrice: string;
  paymentStatus: string;
  attendeeNames: string;
  registrationStatus: string;
  emailConsent: string;
  mediaConsent: string;
}

interface LookupResult {
  status: string;
  message?: string;
  memberId?: string;
  guestId?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  referredBy?: string;
  memberStatus?: string;
  spouseEmail?: string;
  checkedInAt?: string;
  registrationData?: RegistrationData;
  guestPolicy?: GuestPolicy;
}

function CheckinWithSearchParams({ eventData, feeSettings: initialFeeSettings }: CheckinClientProps) {
  const searchParams = useSearchParams();
  return <CheckinContent eventData={eventData} feeSettings={initialFeeSettings} searchParams={searchParams} />;
}

function CheckinContent({ eventData, feeSettings: initialFeeSettings, searchParams }: CheckinClientProps & { searchParams: ReadonlyURLSearchParams }) {
  const router = useRouter();
  const eventId = eventData.id;
  const { data: session } = useSession();

  const eventName = eventData.name;
  const eventDescription = eventData.description;
  const eventDate = eventData.date;
  const categoryLogoUrl = eventData.categoryLogoUrl;
  const categoryBgColor = eventData.categoryBgColor;

  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [checkedInTime, setCheckedInTime] = useState('');
  const [adults, setAdults] = useState(0);
  const [freeKids, setFreeKids] = useState(0);
  const [paidKids, setPaidKids] = useState(0);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [regType, setRegType] = useState<'Member' | 'Guest'>('Guest');
  const [preRegistered, setPreRegistered] = useState(false);
  const [preRegisteredPaid, setPreRegisteredPaid] = useState(false);

  // Event config
  const [guestPolicy, setGuestPolicy] = useState<GuestPolicy | null>(null);

  const [paymentInfo, setPaymentInfo] = useState<{
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
  }>({ paymentStatus: '', paymentMethod: '', transactionId: '' });
  const [pendingCheckinType, setPendingCheckinType] = useState<'Member' | 'Guest'>('Guest');

  const [feeSettings] = useState<FeeSettings | null>(initialFeeSettings);

  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [emailConsent, setEmailConsent] = useState(true);
  const [mediaConsent, setMediaConsent] = useState(true);

  // Extract capacity mode early for use in useEffect
  const capMode = eventData.capacityMode || 'per_registration';
  const capModes = capMode.split(',').map((m: string) => m.trim());
  const isPerAdult = capModes.includes('per_adult');
  const isPerKid = capModes.includes('per_kid');

  // Manage attendeeNames array size when counts change
  useEffect(() => {
    if (isPerAdult || isPerKid) {
      const targetCount = (isPerAdult && isPerKid) ? adults + freeKids + paidKids : isPerAdult ? adults : (freeKids + paidKids);
      setAttendeeNames(prev => {
        const updated = [...prev];
        // Extend array if needed, but don't truncate to preserve user input
        while (updated.length < targetCount) {
          updated.push('');
        }
        return updated;
      });
    }
  }, [adults, freeKids, paidKids, capMode, isPerAdult, isPerKid]);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, phone: formatPhone(digits) || digits }));
    setFieldErrors((fe) => ({ ...fe, phone: null }));
  };

  // Auto-advance splash screen after 3 seconds.
  // If a session exists, attempt to auto-load profile and skip email entry.
  useEffect(() => {
    if (step !== 'splash') return;
    const timer = setTimeout(async () => {
      if (session?.user?.email) {
        try {
          const profile = await loadMyProfile(eventId);
          const data = profile as unknown as LookupResult;
          applyCheckinLookupResult(data, session.user!.email!, true);
          return;
        } catch {
          // Profile load failed — fall through to lookup step
        }
      }
      setStep('lookup');
    }, 3000);
    return () => clearTimeout(timer);
  }, [step, session]);

  // Fee settings provided by server

  // Recalculate price when inputs change
  useEffect(() => {
    const hasGuestPricing = regType === 'Guest' && pricingRules &&
      (pricingRules.guestAdultPrice > 0 || pricingRules.guestKidPrice > 0);
    const shouldCalcPrice = pricingRules && (pricingRules.enabled || hasGuestPricing);

    if (shouldCalcPrice) {
      const breakdown = calculatePrice({
        pricingRules,
        type: regType,
        adults,
        freeKids,
        paidKids,
        otherSubEventCount: 0,
      });
      setPriceBreakdown(breakdown);
    } else {
      setPriceBreakdown(null);
    }
  }, [pricingRules, regType, adults, freeKids, paidKids]);

  /**
   * Core routing logic after we have a lookup result for check-in.
   * hasSession=true means PII is available; false means public result only.
   */
  const applyCheckinLookupResult = useCallback((data: LookupResult, emailUsed: string, hasSession = false) => {
    setLookupResult(data);
    if (data.guestPolicy) setGuestPolicy(data.guestPolicy);
    const effectiveGuestPolicy = data.guestPolicy || guestPolicy;

    // Pre-fill from registration data if available
    if (data.registrationData) {
      if (data.registrationData.registrationStatus === 'waitlist') {
        setStep('waitlisted');
        return;
      }
      setPreRegistered(true);
      setPreRegisteredPaid(data.registrationData.paymentStatus === 'paid');
      setEmailConsent(data.registrationData.emailConsent !== 'false');
      setMediaConsent(data.registrationData.mediaConsent === 'true');
      setAdults(data.registrationData.registeredAdults || 0);
      const totalKids = data.registrationData.registeredKids || 0;
      setFreeKids(totalKids);
      setPaidKids(0);
      if (data.registrationData.attendeeNames) {
        try {
          const parsed = JSON.parse(data.registrationData.attendeeNames);
          if (Array.isArray(parsed)) {
            setAttendeeNames(parsed.map((e: unknown) => String(e)));
          }
        } catch {
          if (data.registrationData.attendeeNames.trim()) {
            setAttendeeNames([data.registrationData.attendeeNames]);
          }
        }
      }
    } else {
      setPreRegistered(false);
      setPreRegisteredPaid(false);
    }

    switch (data.status) {
      case 'already_checked_in':
        setCheckedInTime(data.checkedInAt || '');
        setForm((f) => ({ ...f, name: data.name || '' }));
        setStep('already_checked_in');
        return;

      case 'already_registered_spouse':
        if (!hasSession) {
          setOtpEmail(emailUsed);
          setForm((f) => ({ ...f, email: emailUsed }));
          sendCheckinOTP(eventId, emailUsed).catch(() => {});
          setStep('otp_verify');
          return;
        }
        if (data.checkedInAt) {
          setCheckedInTime(data.checkedInAt);
          setForm((f) => ({ ...f, name: data.name || '' }));
          setStep('already_checked_in');
        } else {
          setRegType('Member');
          setForm((f) => ({
            ...f,
            name: data.name || '',
            email: data.email || emailUsed,
            phone: data.phone || '',
          }));
          setStep('member_active');
        }
        return;

      case 'member_active':
        if (!hasSession) {
          setOtpEmail(emailUsed);
          setForm((f) => ({ ...f, email: emailUsed }));
          sendCheckinOTP(eventId, emailUsed).catch(() => {});
          setStep('otp_verify');
          return;
        }
        setRegType('Member');
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || emailUsed,
          phone: data.phone || '',
        }));
        setStep('member_active');
        return;

      case 'member_expired':
        if (!hasSession) {
          setOtpEmail(emailUsed);
          setForm((f) => ({ ...f, email: emailUsed }));
          sendCheckinOTP(eventId, emailUsed).catch(() => {});
          setStep('otp_verify');
          return;
        }
        setRegType('Guest');
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || emailUsed,
          phone: '',
        }));
        setStep('member_expired');
        return;

      case 'pending_application':
        setStep('pending_application');
        return;

      case 'returning_guest':
      case 'not_found':
      default:
        // Guest/unknown — require OTP for unauthenticated callers
        if (!hasSession) {
          setOtpEmail(emailUsed);
          setForm((f) => ({ ...f, email: emailUsed }));
          sendCheckinOTP(eventId, emailUsed).catch(() => {});
          setStep('otp_verify');
          return;
        }
        setRegType('Guest');
        if (data.status === 'returning_guest') {
          setForm({
            name: data.name || '',
            email: data.email || emailUsed,
            phone: data.phone || '',
          });
        } else {
          setForm((f) => ({ ...f, email: emailUsed }));
        }
        if (effectiveGuestPolicy && (!effectiveGuestPolicy.allowGuests || effectiveGuestPolicy.guestAction === 'blocked')) {
          setErrorMsg(effectiveGuestPolicy.guestMessage || 'Guest check-in is not available for this event.');
          setStep('error');
        } else {
          setStep('membership_offer');
        }
        return;
    }
  }, [eventId, guestPolicy]);

  const handleOTPVerified = useCallback((profile: OTPVerifiedProfile, _code?: string) => {
    const data = profile as unknown as LookupResult;
    setLookupResult(data);
    if (data.guestPolicy) setGuestPolicy(data.guestPolicy);
    const effectiveGuestPolicy = data.guestPolicy || guestPolicy;

    if (profile.status === 'already_registered_spouse') {
      if (profile.checkedInAt) {
        setCheckedInTime(profile.checkedInAt);
        setForm((f) => ({ ...f, name: profile.name || '' }));
        setStep('already_checked_in');
      } else {
        setRegType('Member');
        setForm({
          name: profile.name || '',
          email: profile.email,
          phone: profile.phone || '',
        });
        setStep('member_active');
      }
      return;
    }

    if (profile.status === 'member_active') {
      setRegType('Member');
      setForm({
        name: profile.name || '',
        email: profile.email,
        phone: profile.phone || '',
      });
      setStep('member_active');
      return;
    }

    if (profile.status === 'member_expired') {
      setRegType('Guest');
      setForm({
        name: profile.name || '',
        email: profile.email,
        phone: '',
      });
      setStep('member_expired');
      return;
    }

    setRegType('Guest');
    if (profile.status === 'returning_guest') {
      setForm({
        name: profile.name || '',
        email: profile.email,
        phone: profile.phone || '',
      });
    } else {
      setForm((f) => ({ ...f, email: profile.email }));
    }
    if (effectiveGuestPolicy && (!effectiveGuestPolicy.allowGuests || effectiveGuestPolicy.guestAction === 'blocked')) {
      setErrorMsg(effectiveGuestPolicy.guestMessage || 'Guest check-in is not available for this event.');
      setStep('error');
    } else {
      setStep('membership_offer');
    }
  }, [guestPolicy]);

  const handleLookup = useCallback(async (email?: string) => {
    const input = (email || lookupEmail.trim());
    if (!input) return;
    // Email-only lookup (phone lookup removed for security)
    const emailErr = validateEmailRequired(input);
    if (emailErr) { setFieldErrors((e) => ({ ...e, lookupEmail: emailErr })); return; }
    setFieldErrors((e) => ({ ...e, lookupEmail: null }));
    setStep('looking_up');
    try {
      const res = await fetch(`/api/events/${eventId}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error || 'Lookup failed');
        setStep('error');
        return;
      }

      const hasSession = !!session?.user?.email;
      applyCheckinLookupResult(json.data as LookupResult, input, hasSession);
    } catch {
      setErrorMsg('Lookup failed.');
      setStep('error');
    }
  }, [eventId, lookupEmail, session, applyCheckinLookupResult]);

  // Initialize from server-provided event data
  useEffect(() => {
    if (eventData.pricingRules) {
      setPricingRules(parsePricingRules(eventData.pricingRules));
    }
    setGuestPolicy(parseGuestPolicy(eventData.guestPolicy || ''));

    if (eventData.status === 'Completed' || eventData.status === 'Cancelled') {
      setErrorMsg(eventData.status === 'Cancelled' ? 'This event has been cancelled.' : 'This event has ended.');
      setStep('error');
      return;
    }

    if (eventData.date) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      const ed = parseLocalDate(eventData.date);
      ed.setUTCDate(ed.getUTCDate() + 1);
      const cutoff = ed.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      if (today > cutoff) {
        setErrorMsg('This event has ended.');
        setStep('error');
        return;
      }
    }

    const prefillEmail = searchParams.get('email');
    if (prefillEmail) {
      setLookupEmail(prefillEmail);
      setStep('lookup');
      setTimeout(() => {
        handleLookup(prefillEmail);
      }, 100);
    } else {
      setStep('splash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          adults: showAdults ? adults : 0,
          kids: showKids ? freeKids + paidKids : 0,
          actualAdults: showAdults ? adults : 0,
          actualKids: showKids ? freeKids + paidKids : 0,
          totalPrice: priceBreakdown ? String(priceBreakdown.total) : '0',
          priceBreakdown: priceBreakdown ? JSON.stringify(priceBreakdown) : '',
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          selectedActivities: '',
          customFields: '',
          attendeeNames: attendeeNames.filter(Boolean).length > 0 ? JSON.stringify(attendeeNames.filter(Boolean)) : '',
          emailConsent: String(emailConsent),
          mediaConsent: String(mediaConsent),
          isCheckin: true,
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
          analytics.checkinCompleted(eventId, type);
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

  const validateCheckinForm = (): boolean => {
    const errors: Record<string, string | null> = {};
    errors.name = validateNameRequired(form.name);
    errors.email = validateEmailRequired(form.email);
    errors.phone = validatePhone(form.phone);
    // Validate attendee names are filled when kid count > 0 and capacity mode requires names
    if (showAttendeeNames) {
      const missingNames = Array.from({ length: attendeeCount }, (_, i) => attendeeNames[i] || '').some((n) => !n.trim());
      if (missingNames) {
        errors.attendeeNames = 'Please enter all attendee names';
      } else {
        errors.attendeeNames = null;
      }
    }
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return !errors.name && !errors.email && !errors.phone && !errors.attendeeNames;
  };

  const doCheckin = async (type: 'Member' | 'Guest') => {
    if (!validateCheckinForm()) return;
    // Skip payment if pre-registered and already paid
    if (preRegisteredPaid) {
      await submitCheckin(type, { paymentStatus: '', paymentMethod: '', transactionId: '' });
      return;
    }
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
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago',
      });
    } catch { return iso; }
  };

  const isFamilyMember = regType === 'Member' && pricingRules?.memberPricingModel === 'family';
  const kidFreeAge = regType === 'Member' ? (pricingRules?.memberKidFreeUnderAge ?? 5) : (pricingRules?.guestKidFreeUnderAge ?? 5);
  const kidMaxAge = regType === 'Member' ? (pricingRules?.memberKidMaxAge ?? 17) : (pricingRules?.guestKidMaxAge ?? 17);

  const showAdults = !isPerKid || isPerAdult;
  const showKids = !isPerAdult || isPerKid;

  const handleNameChange = useCallback((index: number, value: string) => {
    setAttendeeNames(prev => {
      const updated = [...prev];
      // Ensure array has enough elements
      while (updated.length <= index) updated.push('');
      updated[index] = value;
      return updated;
    });
  }, []);

  const attendeeCount = (isPerAdult && isPerKid) ? adults + freeKids + paidKids : isPerAdult ? adults : isPerKid ? (freeKids + paidKids) : 0;
  const showAttendeeNames = (isPerAdult || isPerKid) && attendeeCount > 0;

  return (
    <PublicLayout eventName={eventName} logoUrl={categoryLogoUrl} bgColor={categoryBgColor} homeUrl={`/events/${eventId}/home`}>
      {/* Loading */}
      {step === 'loading' && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Splash Screen */}
      {step === 'splash' && (() => {
        const splashTheme = getEventTheme(categoryBgColor);
        return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br ${splashTheme.gradient}`}>
          {/* Decorative blobs */}
          <div className={`absolute top-0 left-0 w-72 h-72 ${splashTheme.blobA} rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3`} />
          <div className={`absolute bottom-0 right-0 w-96 h-96 ${splashTheme.blobB} rounded-full blur-3xl translate-x-1/4 translate-y-1/4`} />

          <div className="relative text-center px-6 max-w-md w-full animate-[fadeInUp_0.6s_ease-out]">
            {/* Logo */}
            <div className="mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={categoryLogoUrl || '/logo.png'}
                alt="Event Logo"
                className="w-28 h-28 mx-auto rounded-2xl shadow-2xl shadow-black/30 object-contain bg-white/10 backdrop-blur-sm p-2 animate-[scaleIn_0.5s_ease-out]"
              />
            </div>

            {/* Event Name */}
            <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight mb-3 drop-shadow-lg">
              {eventName}
            </h1>

            {/* Date */}
            {eventDate && (
              <p className="text-white/70 text-sm mb-2">
                {(() => {
                  try {
                    return parseLocalDate(eventDate).toLocaleDateString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
                    });
                  } catch { return eventDate; }
                })()}
              </p>
            )}

            {/* Description */}
            {eventDescription && (
              <p className="text-white/60 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                {eventDescription}
              </p>
            )}

            {/* Progress indicator */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white/80 rounded-full animate-[progressBar_2.5s_ease-in-out]" />
              </div>
            </div>

            {/* Tap to continue */}
            <button
              onClick={() => setStep('lookup')}
              className="text-white/50 text-xs hover:text-white/80 transition-colors animate-[fadeIn_1s_ease-out_1s_both]"
            >
              Tap to continue
            </button>
          </div>

          <style jsx>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes scaleIn {
              from { opacity: 0; transform: scale(0.7); }
              to { opacity: 1; transform: scale(1); }
            }
            @keyframes progressBar {
              from { width: 0%; }
              to { width: 100%; }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
        );
      })()}

      {/* Error */}
      {step === 'error' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          {errorMsg !== 'This event has ended.' && errorMsg !== 'This event has been cancelled.' && errorMsg !== 'Event not found.' && (
            <button onClick={() => { setErrorMsg(''); setStep('lookup'); }} className="mt-4 btn-secondary">
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Step: Lookup */}
      {step === 'lookup' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Event Check-in</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter your email address to check in. We&apos;ll send a verification code.</p>
          <div className="space-y-3">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                inputMode="email"
                value={lookupEmail}
                onChange={(e) => { setLookupEmail(e.target.value); setFieldErrors((fe) => ({ ...fe, lookupEmail: null })); }}
                className={`input ${fieldErrors.lookupEmail ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <FieldError error={fieldErrors.lookupEmail} />
            </div>
            <button onClick={() => handleLookup()} disabled={!lookupEmail.trim() || !!fieldErrors.lookupEmail} className="btn-primary w-full">
              Continue
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

      {/* Step: OTP verification */}
      {step === 'otp_verify' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Verify Your Email</h2>
          <OTPStep
            email={otpEmail || lookupEmail.trim()}
            eventId={eventId}
            purpose="checkin"
            onVerified={handleOTPVerified}
            onBack={() => setStep('lookup')}
          />
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
            {preRegisteredPaid && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Payment already received at registration</p>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((fe) => ({ ...fe, name: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, name: validateNameRequired(form.name) }))}
                className={`input ${fieldErrors.name ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.name} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((fe) => ({ ...fe, email: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, email: validateEmailRequired(form.email) }))}
                className={`input ${fieldErrors.email ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.email} />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, phone: validatePhone(form.phone) }))}
                className={`input ${fieldErrors.phone ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="(555) 123-4567"
              />
              <FieldError error={fieldErrors.phone} />
            </div>
            {/* Adults & Kids Inputs */}
            <div className="space-y-3">
              {preRegistered && (
                <p className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                  Already registered. You can adjust your actual attendance numbers below if needed.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {showAdults && (
                  <div>
                    <label className="label">Adults</label>
                    <input type="number" min={0} value={adults} onChange={(e) => setAdults(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                  </div>
                )}
                {showKids && (
                  isFamilyMember ? (
                    <div>
                      <label className="label">Kids</label>
                      <input type="number" min={0} value={freeKids} onChange={(e) => { setFreeKids(Math.max(0, parseInt(e.target.value) || 0)); setPaidKids(0); }} className="input" />
                    </div>
                  ) : (
                    <div>
                      <label className="label">Kids {kidFreeAge} and under (free)</label>
                      <input type="number" min={0} value={freeKids} onChange={(e) => setFreeKids(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                    </div>
                  )
                )}
              </div>
              {showKids && !isFamilyMember && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Kids age {kidFreeAge + 1}–{kidMaxAge}</label>
                    <input type="number" min={0} value={paidKids} onChange={(e) => setPaidKids(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                  </div>
                </div>
              )}
              {isFamilyMember && pricingRules && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Flat family price — ${pricingRules.memberFamilyPrice}</p>
              )}
            </div>
            {/* Attendee Name Inputs */}
            {showAttendeeNames && (
              <div className="space-y-2 mt-3">
                <label className="label">
                  Attendee Names{isPerKid ? ' & Ages' : ''}
                </label>
                {preRegistered && attendeeNames.length > 0 && (
                  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">From your registration:</p>
                    <div className="text-sm text-blue-600 dark:text-blue-400">
                      {attendeeNames.slice(0, attendeeCount).map((name, i) => (
                        <div key={i}>• {name}</div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.from({ length: attendeeCount }, (_, i) => (
                  <input
                    key={`attendee-${i}`}
                    type="text"
                    value={attendeeNames[i] || ''}
                    onChange={(e) => handleNameChange(i, e.target.value)}
                    className="input"
                    placeholder={isPerAdult && isPerKid ? (i < adults ? `Adult ${i + 1} name` : `Kid ${i - adults + 1} name (age X)`) : isPerAdult ? `Adult ${i + 1} name` : `Kid ${i + 1} name (age X)`}
                  />
                ))}
                {isPerKid && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    For kids, please include age in parentheses, e.g., &quot;Sarah (age 8)&quot;
                  </p>
                )}
                <FieldError error={fieldErrors.attendeeNames} />
              </div>
            )}
            {!preRegisteredPaid && priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Consent</h3>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(e) => setEmailConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I agree to receive event updates, newsletters, and community announcements via email. This applies to all registered participants including spouse. You can unsubscribe at any time.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mediaConsent}
                  onChange={(e) => setMediaConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I grant permission for photos and videos taken during this event to be used on the organization&apos;s social media channels, YouTube, website, and promotional materials.
                </span>
              </label>
            </div>
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
            {guestPolicy?.guestAction === 'become_member'
              ? 'Membership Required'
              : 'Interested in becoming a member?'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {guestPolicy?.guestMessage || 'Members enjoy benefits at all our events. Join our community today!'}
          </p>
          <div className="space-y-3">
            <a
              href="/membership/apply"
              className="btn-primary w-full inline-block text-center"
            >
              Become a Member
            </a>
            {guestPolicy?.guestAction !== 'become_member' && (
              <button
                onClick={() => setStep('guest_form')}
                className="btn-secondary w-full"
              >
                Continue as Guest
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step: Pending Application */}
      {step === 'pending_application' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineClock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Application Under Review</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            We found a membership application for this email that is currently being reviewed by our Board of Directors.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Please wait for approval</strong> before checking in to events. You will receive an email notification once your membership application has been reviewed.
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Questions? Contact us for assistance.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => router.push(`/events/${eventId}/home`)}
              className="btn-primary w-full"
            >
              Go to Event Page
            </button>
            <button
              onClick={() => { setStep('lookup'); setLookupEmail(''); }}
              className="btn-secondary w-full"
            >
              Try Different Email
            </button>
          </div>
        </div>
      )}

      {/* Step: Waitlisted */}
      {step === 'waitlisted' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineClock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">On Waitlist</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            You are currently on the waitlist for this event. The event has reached its capacity.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>You cannot check in yet.</strong> Please wait to be notified if a spot becomes available. We&apos;ll contact you if someone cancels their registration.
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Questions? Contact the event organizers for assistance.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => router.push(`/events/${eventId}/home`)}
              className="btn-primary w-full"
            >
              Go to Event Page
            </button>
            <button
              onClick={() => { setStep('lookup'); setLookupEmail(''); }}
              className="btn-secondary w-full"
            >
              Try Different Email
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
              <label className="label">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((fe) => ({ ...fe, email: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, email: validateEmailRequired(form.email) }))}
                className={`input ${fieldErrors.email ? 'border-red-500 dark:border-red-500' : ''}`}
                required
              />
              <FieldError error={fieldErrors.email} />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, phone: validatePhone(form.phone) }))}
                className={`input ${fieldErrors.phone ? 'border-red-500 dark:border-red-500' : ''}`}
                required
                placeholder="(555) 123-4567"
              />
              <FieldError error={fieldErrors.phone} />
            </div>
            {/* Adults & Kids Inputs */}
            <div className="space-y-3">
              {preRegistered && (
                <p className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                  Already registered. You can adjust your actual attendance numbers below if needed.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {showAdults && (
                  <div>
                    <label className="label">Adults</label>
                    <input type="number" min={0} value={adults} onChange={(e) => setAdults(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                  </div>
                )}
                {showKids && (
                  isFamilyMember ? (
                    <div>
                      <label className="label">Kids</label>
                      <input type="number" min={0} value={freeKids} onChange={(e) => { setFreeKids(Math.max(0, parseInt(e.target.value) || 0)); setPaidKids(0); }} className="input" />
                    </div>
                  ) : (
                    <div>
                      <label className="label">Kids {kidFreeAge} and under (free)</label>
                      <input type="number" min={0} value={freeKids} onChange={(e) => setFreeKids(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                    </div>
                  )
                )}
              </div>
              {showKids && !isFamilyMember && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Kids age {kidFreeAge + 1}–{kidMaxAge}</label>
                    <input type="number" min={0} value={paidKids} onChange={(e) => setPaidKids(Math.max(0, parseInt(e.target.value) || 0))} className="input" />
                  </div>
                </div>
              )}
              {isFamilyMember && pricingRules && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Flat family price — ${pricingRules.memberFamilyPrice}</p>
              )}
            </div>
            {/* Attendee Name Inputs */}
            {showAttendeeNames && (
              <div className="space-y-2 mt-3">
                <label className="label">
                  Attendee Names{isPerKid ? ' & Ages' : ''}
                </label>
                {preRegistered && attendeeNames.length > 0 && (
                  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">From your registration:</p>
                    <div className="text-sm text-blue-600 dark:text-blue-400">
                      {attendeeNames.slice(0, attendeeCount).map((name, i) => (
                        <div key={i}>• {name}</div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.from({ length: attendeeCount }, (_, i) => (
                  <input
                    key={`attendee-${i}`}
                    type="text"
                    value={attendeeNames[i] || ''}
                    onChange={(e) => handleNameChange(i, e.target.value)}
                    className="input"
                    placeholder={isPerAdult && isPerKid ? (i < adults ? `Adult ${i + 1} name` : `Kid ${i - adults + 1} name (age X)`) : isPerAdult ? `Adult ${i + 1} name` : `Kid ${i + 1} name (age X)`}
                  />
                ))}
                {isPerKid && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    For kids, please include age in parentheses, e.g., &quot;Sarah (age 8)&quot;
                  </p>
                )}
                <FieldError error={fieldErrors.attendeeNames} />
              </div>
            )}
            {!preRegisteredPaid && priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
            {preRegisteredPaid && (
              <p className="text-xs text-green-600 dark:text-green-400">Payment already received at registration</p>
            )}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Consent</h3>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(e) => setEmailConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I agree to receive event updates, newsletters, and community announcements via email. This applies to all registered participants including spouse. You can unsubscribe at any time.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mediaConsent}
                  onChange={(e) => setMediaConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I grant permission for photos and videos taken during this event to be used on the organization&apos;s social media channels, YouTube, website, and promotional materials.
                </span>
              </label>
            </div>
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
          eventId={eventId}
          eventName={eventName}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={(result) => {
            submitCheckin(pendingCheckinType, {
              paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
              paymentMethod: result.method === 'terminal' ? 'Square Terminal' : result.method,
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
          zelleEmail={feeSettings?.zelleEmail}
          zellePhone={feeSettings?.zellePhone}
          showTerminal
          providers={['square', 'terminal', 'zelle']}
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
      {step === 'success' && (() => {
        const isZelleCheckin = paymentInfo.paymentMethod === 'zelle';
        return (
          <div className="card p-6 text-center">
            <div className={`w-16 h-16 ${isZelleCheckin ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              {isZelleCheckin ? (
                <HiOutlineExclamationTriangle className="w-10 h-10 text-amber-600 dark:text-amber-400" />
              ) : (
                <HiOutlineCheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {isZelleCheckin ? 'Check-in On Hold' : 'You\'re In!'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{form.name}</p>
            {isZelleCheckin ? (
              <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your Zelle payment is being verified. Your check-in will be confirmed once the committee verifies the payment, typically within <strong>1 business day</strong>.
                </p>
              </div>
            ) : paymentInfo.transactionId ? (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Payment confirmed ({paymentInfo.paymentMethod}) — {paymentInfo.transactionId}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatTime(checkedInTime)}</p>
            <a
              href={`/events/${eventId}/home`}
              className="mt-4 btn-primary inline-flex items-center"
            >
              Go Back Home
            </a>
          </div>
        );
      })()}
    </PublicLayout>
  );
}

export default function CheckinClient(props: CheckinClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckinWithSearchParams {...props} />
    </Suspense>
  );
}
