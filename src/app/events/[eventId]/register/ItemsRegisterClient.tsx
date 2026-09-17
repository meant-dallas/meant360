'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { formatCurrency } from '@/lib/utils';
import DynamicFormRenderer, { validateDynamicFields } from '@/components/events/DynamicFormRenderer';
import PaymentForm from '@/components/events/PaymentForm';
import PublicLayout from '@/components/events/PublicLayout';
import SignInRequiredStep from '@/components/events/SignInRequiredStep';
import PriceDisplay from '@/components/events/PriceDisplay';
import FieldError from '@/components/ui/FieldError';
import { validateNameRequired, validateName, validatePhone, validateAge } from '@/lib/validation';
import { calculateItemsPrice } from '@/lib/pricing';
import type { FormFieldConfig, ItemConfig, EventPaymentConfig, RegistrantType, DiscountRules } from '@/types';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineMinus, HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlineExclamationTriangle } from 'react-icons/hi2';

interface ItemWithCapacity extends ItemConfig {
  remainingCapacity: number | null;
}

interface ItemsRegisterClientProps {
  eventId: string;
  event: {
    id: string;
    name: string;
    date: string;
    description: string;
    registrationOpen: boolean;
    categoryLogoUrl?: string;
    categoryBgColor?: string;
    selfServiceEditEnabled?: boolean;
    cancelRefundEnabled?: boolean;
  };
  registrantTypeLabel: string;
  registrantTypes: RegistrantType[];
  maxAttendeesPerRegistration: number | null;
  allowGuests: boolean;
  discountRules: DiscountRules;
  additionalInfoHeading?: string;
  additionalInfoSubheading?: string;
  formConfig: FormFieldConfig[];
  items: ItemWithCapacity[];
  paymentConfig: EventPaymentConfig;
  feeSettings?: { paypalFeePercent?: number; paypalFeeFixed?: number; zelleEmail?: string; zellePhone?: string };
}

type Step = 'identify' | 'sign_in_required' | 'otp_verify' | 'blocked' | 'already_registered' | 'cancel_confirm' | 'cancelled' | 'items' | 'details' | 'payment' | 'submitting' | 'success';

interface ExistingRegistration {
  id: string;
  registrationStatus: string;
  contactName: string;
  contactPhone: string;
  totalPrice: string;
  paymentStatus: string;
  paymentMethod: string;
  attendeeCount: string;
  customFieldResponses?: string;
  participants: { id: string; name: string; age: string; checkedInAt: string }[];
  itemSelections: { id: string; itemId: string; itemName: string; quantity: string; priceCharged: string; status: string; customFieldResponses?: string }[];
}

export default function ItemsRegisterClient({
  eventId,
  event,
  registrantTypeLabel,
  registrantTypes,
  maxAttendeesPerRegistration,
  allowGuests,
  discountRules,
  additionalInfoHeading,
  additionalInfoSubheading,
  formConfig,
  items,
  paymentConfig,
  feeSettings,
}: ItemsRegisterClientProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>('identify');

  // --- Identity (OTP) ---
  const [identifyEmail, setIdentifyEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [blockedMessage, setBlockedMessage] = useState('');
  const [signInFirstName, setSignInFirstName] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [familyMembers, setFamilyMembers] = useState<{ name: string; age: string }[]>([]);
  const [existingRegistration, setExistingRegistration] = useState<ExistingRegistration | null>(null);
  const sessionResumeTried = useRef(false);

  // --- Self-service edit/cancel of an existing registration ---
  const [isModifying, setIsModifying] = useState(false);
  const [originalPaidAmount, setOriginalPaidAmount] = useState(0);
  const [isUpdateSuccess, setIsUpdateSuccess] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  type IdentityResult = { isMember: boolean; memberId?: string; memberName?: string; allowGuests: boolean; existingRegistration: ExistingRegistration | null; email?: string; familyMembers?: { name: string; age: string }[] };

  const applyIdentityResult = (data: IdentityResult, email: string) => {
    setIdentifyEmail(email);
    setIsMember(data.isMember);
    setMemberId(data.memberId || '');
    setFamilyMembers(data.familyMembers || []);

    if (data.existingRegistration && data.existingRegistration.registrationStatus !== 'cancelled') {
      setExistingRegistration(data.existingRegistration);
      if (data.memberName) setContactName(data.memberName);
      setStep('already_registered');
      return;
    }
    if (!data.allowGuests && !data.isMember) {
      setBlockedMessage('This event is open to verified MEANT members only.');
      setStep('blocked');
      return;
    }
    if (data.memberName) setContactName(data.memberName);
    setStep(items.length > 0 ? 'items' : 'details');
  };

  // Resume an existing NextAuth session or still-valid guest-session cookie
  // (e.g. verified a few minutes ago, or navigating back from another step)
  // instead of asking for OTP again.
  const [checkingSession, setCheckingSession] = useState(true);
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
        if (json.success) {
          applyIdentityResult(json.data, json.data.email);
          return;
        }
      } catch { /* fall through to manual identify */ }
      setCheckingSession(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, session]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [itemFieldValues, setItemFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [itemFieldErrors, setItemFieldErrors] = useState<Record<string, Record<string, string | null>>>({});

  const [contactName, setContactName] = useState('');
  const [contactNameError, setContactNameError] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [participantErrors, setParticipantErrors] = useState<Record<number, { name?: string | null; age?: string | null }>>({});
  const [regFieldValues, setRegFieldValues] = useState<Record<string, string>>({});
  const [regFieldErrors, setRegFieldErrors] = useState<Record<string, string | null>>({});
  const [detailsError, setDetailsError] = useState('');
  const [itemsError, setItemsError] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [successData, setSuccessData] = useState<{ totalPrice: string; registrationStatus: string; paymentMethod: string } | null>(null);

  const priceFor = (item: ItemWithCapacity) => (isMember ? item.memberPrice : item.guestPrice);

  const isSelected = (item: ItemWithCapacity) => item.required || item.isGeneralAttendance || (quantities[item.id] || 0) > 0;

  const selectedItems = useMemo(
    () => items.filter((i) => i.enabled && (i.required || i.isGeneralAttendance || (quantities[i.id] || 0) > 0)),
    [items, quantities],
  );

  // Auto-open the first item so users aren't required to click a checkbox
  // just to see what's inside (e.g. a single-item Survey event).
  const autoOpenedFirstItem = useRef(false);
  useEffect(() => {
    if (autoOpenedFirstItem.current || step !== 'items') return;
    const enabled = items.filter((i) => i.enabled);
    if (enabled.length === 0) return;
    autoOpenedFirstItem.current = true;
    const first = enabled[0];
    if (!first.required) {
      setQuantities((q) => ({ ...q, [first.id]: q[first.id] || 1 }));
    }
  }, [items, step]);

  const lineItems = useMemo(
    () => selectedItems.map((item) => {
      const quantity = item.pricingMode === 'flat'
        ? 1
        : item.isGeneralAttendance
          ? Math.max(1, participants.length)
          : Math.max(1, quantities[item.id] || 1);
      const price = item.pricingMode === 'flat' ? priceFor(item) : priceFor(item) * quantity;
      return { item, quantity, price };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedItems, quantities, isMember, participants],
  );

  const priceBreakdown = useMemo(
    () => calculateItemsPrice(
      lineItems.map(({ item, quantity, price }) => ({
        itemName: item.name,
        pricingMode: item.pricingMode,
        unitPrice: priceFor(item),
        quantity,
        amount: price,
        isGeneralAttendance: item.isGeneralAttendance,
      })),
      discountRules,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineItems, discountRules, isMember],
  );
  const total = priceBreakdown.total;

  const toggleFlatItem = (item: ItemWithCapacity, checked: boolean) => {
    setQuantities((q) => ({ ...q, [item.id]: checked ? 1 : 0 }));
  };

  const setQuantity = (item: ItemWithCapacity, quantity: number) => {
    const capped = item.remainingCapacity != null ? Math.min(quantity, item.remainingCapacity) : quantity;
    setQuantities((q) => ({ ...q, [item.id]: Math.max(0, capped) }));
  };

  const soldOut = (item: ItemWithCapacity) => item.remainingCapacity != null && item.remainingCapacity <= 0 && !isSelected(item);

  const handleSendCode = async () => {
    setOtpError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifyEmail.trim())) {
      setOtpError('Enter a valid email address.');
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: identifyEmail.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setOtpError(json.error || 'Failed to send code'); return; }
      if (json.data?.requiresSignIn) {
        setSignInFirstName(json.data.firstName || '');
        setStep('sign_in_required');
        return;
      }
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
        body: JSON.stringify({ action: 'verify', email: identifyEmail.trim(), code: otpCode.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setOtpError(json.error || 'Invalid or expired code'); setOtpVerifying(false); return; }
      applyIdentityResult(json.data, identifyEmail.trim());
    } catch {
      setOtpError('Failed to verify code. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleContinueFromItems = () => {
    setItemsError('');
    if (items.some((i) => i.enabled) && selectedItems.length === 0) {
      setItemsError('Please select at least one item to continue.');
      return;
    }
    let firstInvalidItemName = '';
    for (const { item } of lineItems) {
      const fieldErrors = validateDynamicFields(item.customFields, itemFieldValues[item.id] || {});
      setItemFieldErrors((prev) => ({ ...prev, [item.id]: fieldErrors }));
      if (!firstInvalidItemName && Object.values(fieldErrors).some(Boolean)) firstInvalidItemName = item.name;
    }

    const newParticipantErrors: Record<number, { name?: string | null; age?: string | null }> = {};
    let hasParticipantError = false;
    participants.forEach((p, i) => {
      const nErr = validateName(p.name);
      const aErr = validateAge(p.age);
      if (nErr || aErr) hasParticipantError = true;
      newParticipantErrors[i] = { name: nErr, age: aErr };
    });
    setParticipantErrors(newParticipantErrors);

    if (firstInvalidItemName) {
      setItemsError(`Please fill in required information for "${firstInvalidItemName}".`);
      return;
    }
    if (hasParticipantError) {
      setItemsError('Please fix the highlighted attendee fields.');
      return;
    }
    // Items events collect everything they need on this page (cart) — the
    // separate contact/additional-info page is only for no-items events
    // (e.g. a Survey), which never reach this handler.
    proceedToPaymentOrSubmit();
  };

  const handleContinueFromDetails = () => {
    setDetailsError('');

    const nameErr = validateNameRequired(contactName);
    setContactNameError(nameErr);
    const phoneErr = validatePhone(contactPhone);
    setContactPhoneError(phoneErr);

    const errors = validateDynamicFields(formConfig, regFieldValues);
    setRegFieldErrors(errors);

    if (nameErr || phoneErr || Object.values(errors).some(Boolean)) {
      setDetailsError('Please fix the highlighted fields.');
      return;
    }
    proceedToPaymentOrSubmit();
  };

  // Editing an existing registration only needs a payment step for the
  // *additional* amount owed (mirrors legacy's updateRegistration) — a
  // decrease is refunded server-side with no payment step at all.
  const paymentAmount = isModifying ? Math.max(0, total - originalPaidAmount) : total;

  const proceedToPaymentOrSubmit = () => {
    if (isModifying) {
      if (paymentAmount > 0) {
        setStep('payment');
      } else {
        submitUpdate({ paymentStatus: '', paymentMethod: '', transactionId: '' });
      }
      return;
    }
    if (total <= 0) {
      submit({ paymentStatus: 'paid', paymentMethod: 'free', transactionId: '' });
    } else {
      setStep('payment');
    }
  };

  const submit = async (payment: { paymentStatus: string; paymentMethod: string; transactionId: string }) => {
    setStep('submitting');
    setSubmitError('');
    // No-items events collect contactName on the details page; items events
    // never show that page, so fall back to the primary attendee's name.
    const effectiveContactName = contactName || participants.find((p) => p.name.trim())?.name || '';
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: isMember ? memberId : '',
          registrantType: registrantTypeLabel,
          attendeeCount: participants.filter((p) => p.name.trim()).length || 1,
          contactName: effectiveContactName,
          contactEmail: identifyEmail.trim(),
          contactPhone,
          customFieldResponses: regFieldValues,
          participants: participants.filter((p) => p.name.trim()),
          itemSelections: lineItems.map(({ item, quantity }) => ({
            itemId: item.id,
            quantity,
            customFieldResponses: itemFieldValues[item.id] || {},
          })),
          ...payment,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(json.error || 'Failed to register');
        setStep(items.length > 0 ? 'items' : 'details');
        return;
      }
      setSuccessData({ totalPrice: json.data.totalPrice, registrationStatus: json.data.registrationStatus, paymentMethod: json.data.paymentMethod });
      setStep('success');
    } catch {
      setSubmitError('Failed to register. Please try again.');
      setStep(items.length > 0 ? 'items' : 'details');
    }
  };

  const submitUpdate = async (payment: { paymentStatus: string; paymentMethod: string; transactionId: string }) => {
    if (!existingRegistration) return;
    setStep('submitting');
    setSubmitError('');
    const effectiveContactName = contactName || participants.find((p) => p.name.trim())?.name || '';
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${existingRegistration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: effectiveContactName,
          contactPhone,
          attendeeCount: participants.filter((p) => p.name.trim()).length || 1,
          customFieldResponses: regFieldValues,
          participants: participants.filter((p) => p.name.trim()),
          itemSelections: lineItems.map(({ item, quantity }) => ({
            itemId: item.id,
            quantity,
            customFieldResponses: itemFieldValues[item.id] || {},
          })),
          ...payment,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(json.error || 'Failed to update registration');
        setStep(items.length > 0 ? 'items' : 'details');
        return;
      }
      setIsUpdateSuccess(true);
      setSuccessData({
        totalPrice: json.data.registration.totalPrice,
        registrationStatus: json.data.registration.registrationStatus,
        paymentMethod: json.data.registration.paymentMethod,
      });
      setStep('success');
    } catch {
      setSubmitError('Failed to update registration. Please try again.');
      setStep(items.length > 0 ? 'items' : 'details');
    }
  };

  // Pre-fill the cart/details state from an existing registration and drop
  // the registrant back into the same flow used to create one, so editing
  // reuses every item tile's own data-collection UI instead of a bespoke
  // edit form.
  const handleStartEdit = () => {
    if (!existingRegistration) return;
    setIsModifying(true);
    setOriginalPaidAmount(existingRegistration.paymentStatus === 'paid' ? parseFloat(existingRegistration.totalPrice || '0') : 0);
    setContactPhone(existingRegistration.contactPhone || '');

    const activeSelections = existingRegistration.itemSelections.filter((s) => s.status !== 'cancelled');
    const newQuantities: Record<string, number> = {};
    const newItemFieldValues: Record<string, Record<string, string>> = {};
    for (const sel of activeSelections) {
      newQuantities[sel.itemId] = parseInt(sel.quantity, 10) || 1;
      if (sel.customFieldResponses) {
        try { newItemFieldValues[sel.itemId] = JSON.parse(sel.customFieldResponses); } catch { /* ignore */ }
      }
    }
    setQuantities(newQuantities);
    setItemFieldValues(newItemFieldValues);

    const existingParticipants = existingRegistration.participants.map((p) => ({ name: p.name, age: p.age }));
    setParticipants(existingParticipants.length > 0 ? existingParticipants : [{ name: '', age: '' }]);

    if (existingRegistration.customFieldResponses) {
      try { setRegFieldValues(JSON.parse(existingRegistration.customFieldResponses)); } catch { /* ignore */ }
    }

    // Skip the "auto-open first item" effect — real selections are already set above.
    autoOpenedFirstItem.current = true;
    setStep(items.length > 0 ? 'items' : 'details');
  };

  const handleCancelRegistration = async () => {
    if (!existingRegistration) return;
    setCancelling(true);
    setCancelError('');
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${existingRegistration.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by registrant' }),
      });
      const json = await res.json();
      if (!json.success) {
        setCancelError(json.error || 'Failed to cancel registration.');
        return;
      }
      setStep('cancelled');
    } catch {
      setCancelError('Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  // "Not you?" — backs out of whatever identity got them here. A signed-in
  // member's identity comes from their real NextAuth session, so that has to
  // be a real sign-out; a guest's identity is just the short-lived
  // guest-session cookie set after OTP verification, so clearing that cookie
  // is enough (httpOnly, so it can only be cleared via this server round-trip).
  const handleUseDifferentEmail = async () => {
    if (session?.user?.email) {
      await signOut({ redirect: false });
    } else {
      try {
        await fetch(`/api/events/${eventId}/items-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear' }),
        });
      } catch { /* best-effort — resetting local state below still lets them re-verify */ }
    }
    setIdentifyEmail('');
    setOtpCode('');
    setOtpError('');
    setIsMember(false);
    setMemberId('');
    setFamilyMembers([]);
    setExistingRegistration(null);
    setIsModifying(false);
    setOriginalPaidAmount(0);
    setContactName('');
    setContactPhone('');
    setParticipants([{ name: '', age: '' }]);
    setQuantities({});
    setItemFieldValues({});
    setRegFieldValues({});
    setBlockedMessage('');
    // The auto-resume effect only ever runs once (sessionResumeTried), so if
    // it succeeded on first load it never had a reason to flip this back to
    // false — without this, the identify card would show its "checking"
    // spinner forever since nothing re-triggers that effect.
    setCheckingSession(false);
    setStep('identify');
  };

  const registrationPaymentProviders = useMemo<('paypal' | 'zelle')[]>(() => {
    const list: ('paypal' | 'zelle')[] = [];
    if (paymentConfig.paypalEnabled) list.push('paypal');
    if (paymentConfig.zelleEnabled) list.push('zelle');
    return list;
  }, [paymentConfig.paypalEnabled, paymentConfig.zelleEnabled]);

  if (!event.registrationOpen) {
    return (
      <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-sm text-gray-600">Registration for {event.name} is currently closed.</p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg">
      <div className="pb-28">
      {identifyEmail && !['identify', 'sign_in_required', 'otp_verify', 'submitting', 'success', 'cancelled'].includes(step) && (
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-3 px-1">
          <span className="truncate">Verified as <span className="font-medium text-gray-700">{identifyEmail}</span></span>
          <button onClick={handleUseDifferentEmail} className="text-primary-600 hover:text-primary-700 shrink-0">Not you?</button>
        </div>
      )}
      {step === 'identify' && (
        <div className="relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          {checkingSession && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div className="text-center">
            <HiOutlineShieldCheck className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h2 className="text-sm font-semibold text-gray-900">Verify Your Email</h2>
            <p className="text-xs text-gray-500 mt-1">
              {allowGuests ? "We'll send a code to confirm your email before you register." : 'This event is open to verified members only — enter your email to check.'}
            </p>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={identifyEmail} onChange={(e) => setIdentifyEmail(e.target.value)} className="input" placeholder="you@example.com" onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }} />
          </div>
          {otpError && <p className="text-sm text-red-600">{otpError}</p>}
          <button onClick={handleSendCode} disabled={otpSending} className="btn-primary w-full">{otpSending ? 'Sending…' : 'Send Code'}</button>
        </div>
      )}

      {step === 'sign_in_required' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <SignInRequiredStep
            firstName={signInFirstName}
            callbackUrl={`/events/${eventId}/register`}
            showGuestOption={false}
            onContinueAsGuest={() => {}}
          />
        </div>
      )}

      {step === 'otp_verify' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">We sent a 6-digit code to <span className="font-medium text-gray-900">{identifyEmail}</span></p>
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

      {step === 'blocked' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-red-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">{blockedMessage}</p>
          <p className="text-sm text-gray-500 mt-1">Join our community to register for this event.</p>
          <a href="/membership/apply" className="mt-4 btn-primary w-full inline-block text-center">
            Join as a Member
          </a>
        </div>
      )}

      {step === 'already_registered' && existingRegistration && (() => {
        const activeSelections = existingRegistration.itemSelections.filter((s) => s.status !== 'cancelled');
        const regTotal = parseFloat(existingRegistration.totalPrice || '0');
        const isPaid = existingRegistration.paymentStatus === 'paid';
        return (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <HiOutlineCheckCircle className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 text-center mb-2">You&apos;re Registered</h2>
            <p className="text-xs text-gray-500 text-center mb-4">Here&apos;s your current registration for this event.</p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-900 font-medium">{existingRegistration.contactName}</span>
              </div>
              {activeSelections.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 shrink-0">Items</span>
                  <span className="text-gray-900 text-right">{activeSelections.map((s) => s.itemName).join(', ')}</span>
                </div>
              )}
              {regTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="text-gray-900">
                    {formatCurrency(regTotal)}
                    {isPaid && <span className="text-green-600 ml-1">(Paid{existingRegistration.paymentMethod ? ` via ${existingRegistration.paymentMethod}` : ''})</span>}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {event.selfServiceEditEnabled && (
                <button onClick={handleStartEdit} className="btn-primary w-full">Edit Registration</button>
              )}
              <button
                onClick={() => { setCancelError(''); setStep('cancel_confirm'); }}
                className="btn-secondary w-full text-red-600 border-red-200"
              >
                Cancel Registration
              </button>
              {!event.selfServiceEditEnabled && (
                <p className="text-xs text-center text-gray-400">Need to change your registration details? Contact the committee.</p>
              )}
            </div>
          </div>
        );
      })()}

      {step === 'cancel_confirm' && existingRegistration && (() => {
        const regTotal = parseFloat(existingRegistration.totalPrice || '0');
        const isPaid = existingRegistration.paymentStatus === 'paid' && regTotal > 0;
        const isAutoRefundable = !!event.cancelRefundEnabled && existingRegistration.paymentMethod?.toLowerCase() === 'paypal';
        return (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Cancel Registration</h2>
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-4 text-sm">
              <p className="font-medium text-gray-900">{existingRegistration.contactName}</p>
              {isPaid ? (
                <p className="text-gray-600 mt-1">
                  {formatCurrency(regTotal)} was paid{isAutoRefundable
                    ? ' and will be refunded to your original payment method.'
                    : ` via ${existingRegistration.paymentMethod || 'an offline method'} — our team will process your refund manually.`}
                </p>
              ) : (
                <p className="text-gray-600 mt-1">No payment is on file for this registration.</p>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to cancel? This cannot be undone.</p>
            {cancelError && <p className="text-sm text-red-500 mb-3">{cancelError}</p>}
            <div className="flex gap-2">
              <button onClick={handleCancelRegistration} disabled={cancelling} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Yes, Cancel Registration'}
              </button>
              <button onClick={() => setStep('already_registered')} disabled={cancelling} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                No, Keep It
              </button>
            </div>
          </div>
        );
      })()}

      {step === 'cancelled' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">Registration cancelled</p>
          <p className="text-sm text-gray-500 mt-1">If a refund is due, it will be processed shortly.</p>
        </div>
      )}

      {step === 'items' && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Select Items</h2>
          {items.filter((i) => i.enabled).map((item) => {
            const selected = isSelected(item);
            const quantity = item.pricingMode === 'flat' ? 1 : (quantities[item.id] || 0);
            const price = priceFor(item);
            const lineItem = lineItems.find((li) => li.item.id === item.id);
            const tileTotal = lineItem?.price ?? 0;
            return (
              <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start gap-3">
                  {item.pricingMode === 'flat' && !item.isGeneralAttendance ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={item.required || soldOut(item)}
                      onChange={(e) => toggleFlatItem(item, e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                    {(price > 0 || item.remainingCapacity != null) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {price > 0 && <>{formatCurrency(price)}{item.pricingMode !== 'flat' ? ` per ${item.pricingMode === 'per_participant' ? 'person' : 'unit'}` : ''}</>}
                        {price > 0 && item.remainingCapacity != null && ' · '}
                        {item.remainingCapacity != null && `${item.remainingCapacity} left`}
                      </p>
                    )}
                    {item.pricingMode !== 'flat' && lineItem && lineItem.quantity > 1 && tileTotal > 0 && (
                      <p className="text-xs font-semibold text-gray-700 mt-1">
                        {lineItem.quantity} × {formatCurrency(price)} = {formatCurrency(tileTotal)}
                      </p>
                    )}
                  </div>
                  {item.pricingMode !== 'flat' && !item.isGeneralAttendance && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => setQuantity(item, quantity - 1)} disabled={quantity <= (item.required ? 1 : 0)} className="p-1 rounded border border-gray-300 disabled:opacity-30">
                        <HiOutlineMinus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm">{quantity}</span>
                      <button type="button" onClick={() => setQuantity(item, quantity + 1)} disabled={soldOut(item)} className="p-1 rounded border border-gray-300 disabled:opacity-30">
                        <HiOutlinePlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {soldOut(item) && <p className="text-xs text-red-600 mt-1">Sold out</p>}
                {item.isGeneralAttendance ? (
                  <div className="mt-3 pl-3 border-l-2 border-gray-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">Who&apos;s attending?</p>
                      {isMember && familyMembers.length > 0 && (
                        <button
                          onClick={() => {
                            const members = maxAttendeesPerRegistration
                              ? familyMembers.slice(0, maxAttendeesPerRegistration - 1)
                              : familyMembers;
                            setParticipants([{ name: contactName, age: '' }, ...members]);
                          }}
                          className="text-xs text-primary-600 hover:text-primary-700"
                        >
                          Use Family from Profile
                        </button>
                      )}
                    </div>
                    {participants.map((p, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => {
                              setParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
                              setParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], name: null } }));
                            }}
                            onBlur={() => setParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], name: validateName(p.name) } }))}
                            className={`input flex-1 ${participantErrors[i]?.name ? 'border-red-500' : ''}`}
                            placeholder="Name"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={p.age}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                              setParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, age: digits } : x)));
                              setParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], age: null } }));
                            }}
                            onBlur={() => setParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], age: validateAge(p.age) } }))}
                            className={`input w-20 ${participantErrors[i]?.age ? 'border-red-500' : ''}`}
                            placeholder="Age"
                          />
                          {participants.length > 1 && (
                            <button onClick={() => setParticipants((ps) => ps.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600">
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <FieldError error={participantErrors[i]?.name || participantErrors[i]?.age} />
                      </div>
                    ))}
                    {(!maxAttendeesPerRegistration || participants.length < maxAttendeesPerRegistration) && (
                      <button onClick={() => setParticipants((ps) => [...ps, { name: '', age: '' }])} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                        <HiOutlinePlus className="w-4 h-4" /> Add Another Participant
                      </button>
                    )}
                  </div>
                ) : selected && item.customFields.length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-gray-100">
                    <DynamicFormRenderer
                      fields={item.customFields}
                      values={itemFieldValues[item.id] || {}}
                      onChange={(v) => setItemFieldValues((prev) => ({ ...prev, [item.id]: v }))}
                      errors={itemFieldErrors[item.id] || {}}
                      onValidate={(e) => setItemFieldErrors((prev) => ({ ...prev, [item.id]: e }))}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {itemsError && <p className="text-sm text-red-600">{itemsError}</p>}

          {total > 0 && <PriceDisplay breakdown={priceBreakdown} />}

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
            <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
              {total > 0 && <span className="text-sm font-semibold text-gray-900">{formatCurrency(total)}</span>}
              <button onClick={handleContinueFromItems} className="btn-primary flex-1 max-w-xs">Continue</button>
            </div>
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
            <div>
              <label className="label">Your Name *</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => { setContactName(e.target.value); if (contactNameError) setContactNameError(null); }}
                onBlur={() => setContactNameError(validateNameRequired(contactName))}
                className={`input ${contactNameError ? 'border-red-500' : ''}`}
              />
              <FieldError error={contactNameError} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email</label>
                <div className="input flex items-center justify-between bg-gray-50 text-gray-500">
                  <span className="truncate">{identifyEmail}</span>
                  <HiOutlineCheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                </div>
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => { setContactPhone(e.target.value); if (contactPhoneError) setContactPhoneError(null); }}
                  onBlur={() => setContactPhoneError(validatePhone(contactPhone))}
                  className={`input ${contactPhoneError ? 'border-red-500' : ''}`}
                />
                <FieldError error={contactPhoneError} />
              </div>
            </div>
          </div>

          {formConfig.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{additionalInfoHeading || 'Additional Information'}</h2>
              {additionalInfoSubheading && <p className="text-xs text-gray-500">{additionalInfoSubheading}</p>}
              <DynamicFormRenderer fields={formConfig} values={regFieldValues} onChange={setRegFieldValues} errors={regFieldErrors} onValidate={setRegFieldErrors} />
            </div>
          )}

          {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
            <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
              {total > 0 && <span className="text-sm font-semibold text-gray-900">{formatCurrency(total)}</span>}
              <button onClick={handleContinueFromDetails} className="btn-primary flex-1 max-w-xs">
                {total > 0 ? 'Continue to Payment' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'payment' && paymentAmount > 0 && (
        <div className="space-y-3">
          <button onClick={() => setStep(items.length > 0 ? 'items' : 'details')} className="btn-secondary text-sm">← Back</button>
          <PaymentForm
            amount={paymentAmount}
            eventId={eventId}
            eventName={event.name}
            payerName={contactName}
            payerEmail={identifyEmail}
            onSuccess={(result) => {
              const payment = {
                paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
                paymentMethod: result.method,
                transactionId: result.transactionId,
              };
              if (isModifying) submitUpdate(payment); else submit(payment);
            }}
            onCancel={() => setStep(items.length > 0 ? 'items' : 'details')}
            paypalFeePercent={paymentConfig.paypalFeePercent ?? feeSettings?.paypalFeePercent}
            paypalFeeFixed={paymentConfig.paypalFeeFixed ?? feeSettings?.paypalFeeFixed}
            zelleEmail={feeSettings?.zelleEmail}
            zellePhone={feeSettings?.zellePhone}
            providers={registrationPaymentProviders}
          />
        </div>
      )}

      {step === 'submitting' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Submitting…</p>
        </div>
      )}

      {step === 'success' && successData && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {successData.registrationStatus === 'waitlist' ? "You're on the waitlist" : isUpdateSuccess ? 'Registration updated!' : 'All set!'}
          </p>
          {(successData.paymentMethod === 'zelle' || parseFloat(successData.totalPrice) > 0) && (
            <p className="text-sm text-gray-500 mt-1">
              {successData.paymentMethod === 'zelle' ? 'Your Zelle payment will be verified shortly.' : `Total: ${formatCurrency(parseFloat(successData.totalPrice))}`}
            </p>
          )}
        </div>
      )}

      {submitError && (step === 'items' || step === 'details') && (
        <p className="text-sm text-red-600 mt-3">{submitError}</p>
      )}
      </div>
    </PublicLayout>
  );
}
