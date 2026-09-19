'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import DynamicFormRenderer, { validateDynamicFields } from '@/components/events/DynamicFormRenderer';
import PaymentForm from '@/components/events/PaymentForm';
import PublicLayout from '@/components/events/PublicLayout';
import SignInRequiredStep from '@/components/events/SignInRequiredStep';
import PriceDisplay from '@/components/events/PriceDisplay';
import ItemsSelectionSummary, { type SelectionSummaryRow } from '@/components/events/ItemsSelectionSummary';
import EventBottomNav from '@/components/events/EventBottomNav';
import FieldError from '@/components/ui/FieldError';
import { validateNameRequired, validateName, validatePhone, validateAge } from '@/lib/validation';
import { calculateItemsPrice } from '@/lib/pricing';
import { describeRefundOutcome, combineRefundOutcomes } from '@/lib/refund-outcome';
import type { FormFieldConfig, ItemConfig, EntryTypeConfig, EventPaymentConfig, RegistrantType, DiscountRules, ItemsTerminology } from '@/types';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineMinus, HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlineExclamationTriangle } from 'react-icons/hi2';

interface EntryTypeWithCapacity extends EntryTypeConfig {
  remainingCapacity: number | null;
}

interface ItemWithCapacity extends ItemConfig {
  remainingCapacity: number | null;
  entryTypes?: EntryTypeWithCapacity[];
}

// A named performer/attendee on one Activity entry. Name is always asked;
// fieldValues/fieldErrors answer that entry type's admin-configured
// participantFields (e.g. age, T-shirt size) — keyed by field id, same
// shape DynamicFormRenderer already expects for any other field list.
interface EntryParticipantDraft {
  name: string;
  fieldValues: Record<string, string>;
  fieldErrors: Record<string, string | null>;
}

// One "Add entry" click on an Activity item — its own entry type, named
// participants, and custom-field answers, independent of every other entry
// of the same item (e.g. one Solo + one Group performance in the same cart).
interface ActivityEntryDraft {
  key: string;
  entryTypeKey: string;
  participants: EntryParticipantDraft[];
  fieldValues: Record<string, string>;
  fieldErrors: Record<string, string | null>;
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
  terminology: ItemsTerminology;
  formConfig: FormFieldConfig[];
  items: ItemWithCapacity[];
  upcomingEvents?: { id: string; name: string; date: string; categoryLogoUrl: string }[];
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
  emailConsent?: string;
  mediaConsent?: string;
  participants: { id: string; name: string; age: string; checkedInAt: string }[];
  itemSelections: { id: string; itemId: string; itemName: string; quantity: string; priceCharged: string; status: string; customFieldResponses?: string; entryTypeKey?: string; participantNames?: string }[];
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
  terminology,
  formConfig,
  items,
  upcomingEvents,
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
  const [cancelRefundMessage, setCancelRefundMessage] = useState('');

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

  // Activity items (isActivity): keyed by itemId, each entry is one "Add
  // entry" click — its own entry type, participant names, and answers.
  const [entries, setEntries] = useState<Record<string, ActivityEntryDraft[]>>({});

  const updateEntry = (itemId: string, entryKey: string, updater: (e: ActivityEntryDraft) => ActivityEntryDraft) => {
    setEntries((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).map((e) => (e.key === entryKey ? updater(e) : e)) }));
  };

  const updateEntryParticipant = (itemId: string, entryKey: string, index: number, updater: (p: EntryParticipantDraft) => EntryParticipantDraft) => {
    updateEntry(itemId, entryKey, (en) => ({ ...en, participants: en.participants.map((p, i) => (i === index ? updater(p) : p)) }));
  };

  const emptyParticipant = (): EntryParticipantDraft => ({ name: '', fieldValues: {}, fieldErrors: {} });

  // Always seed a new entry with exactly one blank participant slot — one
  // click adds one participant row, regardless of the entry type's
  // minParticipants. minParticipants is enforced as a submit-time validation
  // (see handleContinueFromItems' `filled.length < minP` check below), not by
  // force-rendering that many required inputs the moment an entry is added.
  const addEntry = (item: ItemWithCapacity) => {
    const entryTypes = item.entryTypes || [];
    const typeKey = entryTypes.find((et) => et.remainingCapacity == null || et.remainingCapacity > 0)?.key || entryTypes[0]?.key;
    if (!typeKey) return;
    setEntries((prev) => ({
      ...prev,
      [item.id]: [
        ...(prev[item.id] || []),
        {
          key: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          entryTypeKey: typeKey,
          participants: [emptyParticipant()],
          fieldValues: {},
          fieldErrors: {},
        },
      ],
    }));
  };

  const removeEntry = (itemId: string, entryKey: string) => {
    setEntries((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).filter((e) => e.key !== entryKey) }));
  };

  const [contactName, setContactName] = useState('');
  const [contactNameError, setContactNameError] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [participantErrors, setParticipantErrors] = useState<Record<number, { name?: string | null; age?: string | null }>>({});
  const [regFieldValues, setRegFieldValues] = useState<Record<string, string>>({});
  const [regFieldErrors, setRegFieldErrors] = useState<Record<string, string | null>>({});
  // Opt-out consent (checked by default, doesn't block submission) —
  // mirrors the legacy (non-items) registration flow's Consent section.
  const [emailConsent, setEmailConsent] = useState(true);
  const [mediaConsent, setMediaConsent] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [itemsError, setItemsError] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [successData, setSuccessData] = useState<{ totalPrice: string; registrationStatus: string; paymentMethod: string } | null>(null);

  const priceFor = (item: ItemWithCapacity) => (isMember ? item.memberPrice : item.guestPrice);

  const isSelected = (item: ItemWithCapacity) => item.required || item.isGeneralAttendance || (quantities[item.id] || 0) > 0;

  // A members-only item (e.g. Dinner Gala) or guest-only item stays hidden
  // from the identity it's not configured for — undefined/absent on either
  // flag means visible to both, so events configured before this feature
  // existed keep showing every enabled item to everyone.
  const isItemVisibleToIdentity = (item: Pick<ItemConfig, 'visibleToMembers' | 'visibleToGuests'>) =>
    isMember ? item.visibleToMembers !== false : item.visibleToGuests !== false;

  const selectedItems = useMemo(
    () => items.filter((i) => i.enabled && isItemVisibleToIdentity(i) && !i.isActivity && (i.required || i.isGeneralAttendance || (quantities[i.id] || 0) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, quantities, isMember],
  );

  // Auto-open the first item so users aren't required to click a checkbox
  // just to see what's inside (e.g. a single-item Survey event). Activity
  // items have no such toggle — they always render their "Add entry" UI.
  const autoOpenedFirstItem = useRef(false);
  useEffect(() => {
    if (autoOpenedFirstItem.current || step !== 'items') return;
    const enabled = items.filter((i) => i.enabled && isItemVisibleToIdentity(i) && !i.isActivity);
    if (enabled.length === 0) return;
    autoOpenedFirstItem.current = true;
    const first = enabled[0];
    if (!first.required) {
      setQuantities((q) => ({ ...q, [first.id]: q[first.id] || 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, step, isMember]);

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

  // Every Activity entry across every Activity item, flattened into one
  // priceable row each — the whole point of isActivity is that the same
  // item can appear here multiple times (e.g. one Solo + one Group entry).
  const activityLineItems = useMemo(() => {
    const result: { item: ItemWithCapacity; entry: ActivityEntryDraft; entryType: EntryTypeConfig; quantity: number; price: number }[] = [];
    for (const item of items) {
      if (!item.isActivity || !item.enabled) continue;
      for (const entry of entries[item.id] || []) {
        const entryType = (item.entryTypes || []).find((et) => et.key === entry.entryTypeKey);
        if (!entryType) continue;
        const filled = entry.participants.filter((p) => p.name.trim());
        const quantity = Math.max(1, filled.length || 1);
        const unitPrice = isMember ? entryType.memberPrice : entryType.guestPrice;
        const price = entryType.pricingMode === 'flat' ? unitPrice : unitPrice * quantity;
        result.push({ item, entry, entryType, quantity, price });
      }
    }
    return result;
  }, [items, entries, isMember]);

  const priceBreakdown = useMemo(
    () => calculateItemsPrice(
      [
        ...lineItems.map(({ item, quantity, price }) => ({
          itemId: item.id,
          itemName: item.name,
          pricingMode: item.pricingMode,
          unitPrice: priceFor(item),
          quantity,
          amount: price,
          isGeneralAttendance: item.isGeneralAttendance,
        })),
        ...activityLineItems.map(({ item, entry, entryType, quantity, price }) => ({
          itemId: item.id,
          itemName: `${item.name} (${entryType.label})`,
          pricingMode: entryType.pricingMode,
          unitPrice: isMember ? entryType.memberPrice : entryType.guestPrice,
          quantity,
          amount: price,
          isGeneralAttendance: false,
          entryTypeKey: entryType.key,
          participantNames: entry.participants.filter((p) => p.name.trim()).map((p) => p.name),
        })),
      ],
      discountRules,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineItems, activityLineItems, discountRules, isMember],
  );
  const total = priceBreakdown.total;

  // Full recap of what was just selected/entered — shown on the success
  // screen so the registrant can confirm what they submitted, mirroring the
  // same item/entry/participant detail the confirmation email includes.
  const summaryRows: SelectionSummaryRow[] = useMemo(() => [
    ...lineItems.map(({ item, price }) => ({ label: item.name, amount: price })),
    ...activityLineItems.map(({ item, entry, entryType, price }) => {
      const filled = entry.participants.filter((p) => p.name.trim());
      const participants = filled.map((p) => {
        // Skip the first field — it doubles as this participant's name
        // (see ActivityEntryDraft), so restating it as "Name: X" alongside
        // the name itself would be redundant.
        const answers = (entryType.participantFields || []).slice(1)
          .map((f) => (p.fieldValues[f.id] ? `${f.label}: ${p.fieldValues[f.id]}` : null))
          .filter((a): a is string => Boolean(a));
        return answers.length > 0 ? `${p.name} (${answers.join(', ')})` : p.name;
      });
      return { label: `${item.name} (${entryType.label})`, amount: price, participants };
    }),
  ], [lineItems, activityLineItems]);
  const summaryRoster = participants.filter((p) => p.name.trim()).map((p) => (p.age ? `${p.name} (${p.age})` : p.name));
  const summaryAdditionalInfo = formConfig.filter((f) => regFieldValues[f.id]).map((f) => ({ label: f.label, value: regFieldValues[f.id] }));

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

  // Surfaces an items-step validation error where the user can actually see
  // it — the banner lives right under the "Select Items" heading, but a
  // long cart means that's off-screen when Continue is clicked from the
  // bottom bar, so scroll them back up to it too.
  const reportItemsError = (msg: string) => {
    setItemsError(msg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContinueFromItems = () => {
    setItemsError('');
    const hasAnySelection = selectedItems.length > 0 || activityLineItems.length > 0;
    if (items.some((i) => i.enabled) && !hasAnySelection) {
      reportItemsError(`Please select at least one ${terminology.itemNoun.toLowerCase()} to continue.`);
      return;
    }
    let firstInvalidItemName = '';
    for (const { item } of lineItems) {
      const fieldErrors = validateDynamicFields(item.customFields, itemFieldValues[item.id] || {});
      setItemFieldErrors((prev) => ({ ...prev, [item.id]: fieldErrors }));
      if (!firstInvalidItemName && Object.values(fieldErrors).some(Boolean)) firstInvalidItemName = item.name;
    }

    // Distinguish "not enough named participants yet" from "a field is
    // invalid" — they need different messages, since the generic "fill in
    // required information" text is misleading when every visible field is
    // actually filled in correctly and the real issue is a headcount
    // minimum (e.g. an entry type configured to require 3+ participants).
    let firstEntryError = '';
    for (const item of items) {
      if (!item.isActivity) continue;
      for (const entry of entries[item.id] || []) {
        const entryType = (item.entryTypes || []).find((et) => et.key === entry.entryTypeKey);
        const minP = Math.max(1, entryType?.minParticipants ?? 1);
        const filled = entry.participants.filter((p) => p.name.trim());
        const hasNameError = entry.participants.some((p) => p.name.trim() && validateName(p.name));
        const fieldErrors = validateDynamicFields(item.customFields, entry.fieldValues);
        const hasFieldError = Object.values(fieldErrors).some(Boolean);
        updateEntry(item.id, entry.key, (e) => ({ ...e, fieldErrors }));

        // Per-participant questions only need answering for filled-in
        // participants — a still-empty extra name row isn't a real performer yet.
        let hasParticipantFieldError = false;
        const participantFields = entryType?.participantFields || [];
        if (participantFields.length > 0) {
          entry.participants.forEach((p, i) => {
            if (!p.name.trim()) return;
            const pErrors = validateDynamicFields(participantFields, p.fieldValues);
            if (Object.values(pErrors).some(Boolean)) hasParticipantFieldError = true;
            updateEntryParticipant(item.id, entry.key, i, (x) => ({ ...x, fieldErrors: pErrors }));
          });
        }

        if (firstEntryError) continue; // keep validating (side effects above), but only report the first problem
        const entryLabel = entryType ? `${item.name} (${entryType.label})` : item.name;
        if (filled.length < minP) {
          const noun = minP === 1 ? terminology.participantNoun.toLowerCase() : terminology.participantNounPlural.toLowerCase();
          firstEntryError = `"${entryLabel}" needs at least ${minP} ${noun} — you've entered ${filled.length}.`;
        } else if (hasNameError || hasFieldError || hasParticipantFieldError) {
          firstEntryError = `Please fill in required information for "${entryLabel}".`;
        }
      }
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

    const regErrors = validateDynamicFields(formConfig, regFieldValues);
    setRegFieldErrors(regErrors);

    if (firstInvalidItemName) {
      reportItemsError(`Please fill in required information for "${firstInvalidItemName}".`);
      return;
    }
    if (firstEntryError) {
      reportItemsError(firstEntryError);
      return;
    }
    if (hasParticipantError) {
      reportItemsError('Please fix the highlighted attendee fields.');
      return;
    }
    if (Object.values(regErrors).some(Boolean)) {
      reportItemsError('Please fix the highlighted fields.');
      return;
    }
    // Items events collect everything they need on this page (cart) — the
    // separate contact-info page is only for no-items events (e.g. a
    // Survey), which never reach this handler. The Additional Information
    // questions still apply here (rendered below the item tiles) since
    // they're independent of whether items are configured.
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

  // Standard/General Attendance items each flatten to one selection row;
  // Activity items flatten to one row per entry (so the same item can appear
  // more than once, each with its own entryTypeKey/participants).
  const buildItemSelections = () => [
    ...lineItems.map(({ item, quantity }) => ({
      itemId: item.id,
      quantity,
      customFieldResponses: itemFieldValues[item.id] || {},
    })),
    ...activityLineItems.map(({ item, entry, entryType }) => ({
      itemId: item.id,
      entryTypeKey: entryType.key,
      quantity: Math.max(1, entry.participants.filter((p) => p.name.trim()).length || 1),
      customFieldResponses: entry.fieldValues,
      participants: entry.participants
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name, fields: p.fieldValues })),
    })),
  ];

  // If the registration POST fails AFTER a payment already captured money
  // (paymentStatus 'paid', or 'pending_zelle' which the registrant already
  // committed to sending), a generic "failed to register" reads as if
  // nothing happened — but their card/PayPal may already have been charged.
  // Surface the transaction id so support can reconcile it instead of the
  // registrant silently believing the attempt was a no-op.
  const paymentLostMessage = (payment: { paymentStatus: string; transactionId: string }, detail: string) => {
    if (payment.paymentStatus !== 'paid' && payment.paymentStatus !== 'pending_zelle') return detail;
    const ref = payment.transactionId ? ` (reference: ${payment.transactionId})` : '';
    return `Your payment may have gone through, but we couldn't save your registration: ${detail}. Please contact us${ref} so we can complete it manually — don't submit payment again.`;
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
          itemSelections: buildItemSelections(),
          emailConsent: String(emailConsent),
          mediaConsent: String(mediaConsent),
          ...payment,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(paymentLostMessage(payment, json.error || 'Failed to register'));
        setStep(items.length > 0 ? 'items' : 'details');
        return;
      }
      setSuccessData({ totalPrice: json.data.totalPrice, registrationStatus: json.data.registrationStatus, paymentMethod: json.data.paymentMethod });
      setStep('success');
    } catch {
      setSubmitError(paymentLostMessage(payment, 'Please try again'));
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
          itemSelections: buildItemSelections(),
          emailConsent: String(emailConsent),
          mediaConsent: String(mediaConsent),
          ...payment,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(paymentLostMessage(payment, json.error || 'Failed to update registration'));
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
      setSubmitError(paymentLostMessage(payment, 'Please try again'));
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
    setEmailConsent(existingRegistration.emailConsent !== 'false');
    setMediaConsent(existingRegistration.mediaConsent === 'true');

    const activeSelections = existingRegistration.itemSelections.filter((s) => s.status !== 'cancelled');
    const newQuantities: Record<string, number> = {};
    const newItemFieldValues: Record<string, Record<string, string>> = {};
    const newEntries: Record<string, ActivityEntryDraft[]> = {};
    for (const sel of activeSelections) {
      const item = items.find((i) => i.id === sel.itemId);
      if (item?.isActivity && sel.entryTypeKey) {
        let rawParticipants: { name: string; fields?: Record<string, string> }[] = [];
        if (sel.participantNames) {
          try { rawParticipants = JSON.parse(sel.participantNames); } catch { /* ignore */ }
        }
        const entryParticipants: EntryParticipantDraft[] = rawParticipants.map((p) => ({
          name: p.name,
          fieldValues: p.fields || {},
          fieldErrors: {},
        }));
        let fieldValues: Record<string, string> = {};
        if (sel.customFieldResponses) {
          try { fieldValues = JSON.parse(sel.customFieldResponses); } catch { /* ignore */ }
        }
        newEntries[sel.itemId] = [
          ...(newEntries[sel.itemId] || []),
          {
            key: `entry_${sel.id}`,
            entryTypeKey: sel.entryTypeKey,
            participants: entryParticipants.length > 0 ? entryParticipants : [emptyParticipant()],
            fieldValues,
            fieldErrors: {},
          },
        ];
        continue;
      }
      newQuantities[sel.itemId] = parseInt(sel.quantity, 10) || 1;
      if (sel.customFieldResponses) {
        try { newItemFieldValues[sel.itemId] = JSON.parse(sel.customFieldResponses); } catch { /* ignore */ }
      }
    }
    setQuantities(newQuantities);
    setItemFieldValues(newItemFieldValues);
    setEntries(newEntries);

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
      const outcome = combineRefundOutcomes(json.data.outcomes || []);
      setCancelRefundMessage(describeRefundOutcome(outcome, 'Your registration').message);
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
    setEntries({});
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

  // Switch an already-added entry's type (via the pill toggle below) —
  // reflows its participant list to the new type's min/max bounds so e.g.
  // Solo (max 1) -> Group (min 2) grows a second name field automatically,
  // and Group -> Solo trims back down to one.
  const switchEntryType = (item: ItemWithCapacity, entryKey: string, newTypeKey: string) => {
    const newType = (item.entryTypes || []).find((et) => et.key === newTypeKey);
    const minP = Math.max(1, newType?.minParticipants ?? 1);
    const maxP = newType?.maxParticipants;
    updateEntry(item.id, entryKey, (en) => {
      // Clear each participant's field answers (including their derived
      // name) — the new type may configure an entirely different set of
      // questions with different field ids, so stale answers/name would be
      // meaningless once the fields underneath them have changed.
      let participants = en.participants.map((p) => ({ ...p, name: '', fieldValues: {}, fieldErrors: {} }));
      while (participants.length < minP) participants = [...participants, emptyParticipant()];
      if (maxP && participants.length > maxP) participants = participants.slice(0, Math.max(maxP, minP));
      return { ...en, entryTypeKey: newTypeKey, participants };
    });
  };

  // Activity items render entirely differently from Standard/GA tiles — no
  // single checkbox/quantity, just an "Add Entry" button and a stack of
  // per-entry cards. Each entry picks (and can re-pick) its own entry type
  // via a pill toggle, then collects that type's participants + this item's
  // custom fields, scoped to that one entry.
  const renderActivityItem = (item: ItemWithCapacity) => {
    const entryTypes = item.entryTypes || [];
    const itemEntries = entries[item.id] || [];
    const allSoldOut = entryTypes.length > 0 && entryTypes.every((et) => et.remainingCapacity != null && et.remainingCapacity <= 0);

    return (
      <div key={item.id} className="bg-white rounded-xl p-4 border border-slate-200">
        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
        {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}

        {itemEntries.length > 0 && (
          <div className="mt-3 space-y-3">
            {itemEntries.map((entry) => {
              const entryType = entryTypes.find((et) => et.key === entry.entryTypeKey);
              const filled = entry.participants.filter((p) => p.name.trim());
              const unitPrice = entryType ? (isMember ? entryType.memberPrice : entryType.guestPrice) : 0;
              const entryPrice = entryType?.pricingMode === 'flat' ? unitPrice : unitPrice * Math.max(1, filled.length || 1);
              const maxP = entryType?.maxParticipants;
              return (
                <div key={entry.key} className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    {entryTypes.length > 1 ? (
                      <select
                        value={entry.entryTypeKey}
                        onChange={(e) => switchEntryType(item, entry.key, e.target.value)}
                        className="select flex-1"
                      >
                        {entryTypes.map((et) => {
                          const soldOutType = et.key !== entry.entryTypeKey && et.remainingCapacity != null && et.remainingCapacity <= 0;
                          return (
                            <option key={et.key} value={et.key} disabled={soldOutType}>
                              {et.label}{soldOutType ? ' (Sold out)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <p className="text-xs font-semibold text-slate-700">{entryType?.label || ''}</p>
                    )}
                    {entryPrice > 0 && <span className="font-mono tabular-nums font-bold text-sm text-slate-900 shrink-0 ml-2">{formatCurrency(entryPrice)}</span>}
                  </div>
                  {entry.participants.map((p, i) => {
                    const participantFields = entryType?.participantFields || [];
                    // The first configured field doubles as this participant's
                    // name (identity for the dashboard/exports/discounts) — no
                    // separate hardcoded name box. Entry types saved before
                    // this existed can still have zero participantFields; for
                    // those only, fall back to one plain name input so old
                    // events don't lose the ability to name participants.
                    const nameField = participantFields[0];
                    return (
                      <div key={i} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                        {participantFields.length > 0 ? (
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <DynamicFormRenderer
                                fields={participantFields}
                                values={p.fieldValues}
                                onChange={(v) => updateEntryParticipant(item.id, entry.key, i, (x) => ({
                                  ...x,
                                  fieldValues: v,
                                  name: nameField ? (v[nameField.id] || '') : x.name,
                                }))}
                                errors={p.fieldErrors}
                                onValidate={(e) => updateEntryParticipant(item.id, entry.key, i, (x) => ({ ...x, fieldErrors: e }))}
                                familyMembers={familyMembers}
                              />
                            </div>
                            {entry.participants.length > 1 && (
                              <button
                                onClick={() => updateEntry(item.id, entry.key, (en) => ({ ...en, participants: en.participants.filter((_, j) => j !== i) }))}
                                className="p-2 mt-0.5 text-slate-400 hover:text-red-600"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateEntryParticipant(item.id, entry.key, i, (x) => ({ ...x, name: value }));
                              }}
                              className="input flex-1"
                              placeholder={`${terminology.participantNoun} name`}
                            />
                            {entry.participants.length > 1 && (
                              <button
                                onClick={() => updateEntry(item.id, entry.key, (en) => ({ ...en, participants: en.participants.filter((_, j) => j !== i) }))}
                                className="p-2 text-slate-400 hover:text-red-600"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!maxP || entry.participants.length < maxP) && (
                    <button
                      onClick={() => updateEntry(item.id, entry.key, (en) => ({ ...en, participants: [...en.participants, emptyParticipant()] }))}
                      className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
                    >
                      <HiOutlinePlus className="w-3.5 h-3.5" /> Add {terminology.participantNoun}
                    </button>
                  )}
                  {item.customFields.length > 0 && (
                    <DynamicFormRenderer
                      fields={item.customFields}
                      values={entry.fieldValues}
                      onChange={(v) => updateEntry(item.id, entry.key, (en) => ({ ...en, fieldValues: v }))}
                      errors={entry.fieldErrors}
                      onValidate={(e) => updateEntry(item.id, entry.key, (en) => ({ ...en, fieldErrors: e }))}
                      familyMembers={familyMembers}
                    />
                  )}
                  <div className="text-right">
                    <button onClick={() => removeEntry(item.id, entry.key)} className="text-xs text-slate-400 hover:text-red-600 underline">
                      Remove this entry
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => addEntry(item)}
          disabled={entryTypes.length === 0 || allSoldOut}
          className="mt-3 flex items-center gap-1.5 text-sm font-medium disabled:opacity-40"
          style={{ color: 'var(--btn-color)' }}
        >
          <HiOutlinePlus className="w-4 h-4" /> Add {entryTypes.length === 1 ? entryTypes[0].label : terminology.entryNoun}
        </button>
        {allSoldOut && <p className="text-xs text-red-600 mt-1">Sold out</p>}
      </div>
    );
  };

  if (!event.registrationOpen) {
    return (
      <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg" variant="ticket">
        <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
          <p className="text-sm text-slate-600">Registration for {event.name} is currently closed.</p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout eventName={event.name} logoUrl={event.categoryLogoUrl} bgColor={event.categoryBgColor} maxWidth="lg" variant="ticket">
      <div className="pb-40">
      {['identify', 'sign_in_required', 'otp_verify', 'items', 'details', 'payment'].includes(step) && (() => {
        const stageIndex = ['identify', 'sign_in_required', 'otp_verify'].includes(step) ? 0 : ['items', 'details'].includes(step) ? 1 : 2;
        return (
          <div className="flex items-center gap-1.5 mb-4 px-1">
            {['Verify', 'Select', 'Pay'].map((label, i) => (
              <div key={label} className="flex-1">
                <div className="h-1 rounded-full" style={{ backgroundColor: i <= stageIndex ? 'var(--btn-color)' : '#e2e8f0' }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-wide mt-1"
                  style={{ color: i === stageIndex ? 'var(--btn-color)' : '#94a3b8' }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        );
      })()}
      {identifyEmail && !['identify', 'sign_in_required', 'otp_verify', 'submitting', 'success', 'cancelled'].includes(step) && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-3 px-1">
          <span className="truncate">Verified as <span className="font-medium text-slate-700">{identifyEmail}</span></span>
          <button onClick={handleUseDifferentEmail} className="text-primary-600 hover:text-primary-700 shrink-0">Not you?</button>
        </div>
      )}
      {step === 'identify' && (
        <div className="relative bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          {checkingSession && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div className="text-center">
            <HiOutlineShieldCheck className="w-8 h-8 text-primary-600 mx-auto mb-2" />
            <h2 className="text-sm font-semibold text-slate-900">Verify Your Email</h2>
            <p className="text-xs text-slate-500 mt-1">
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
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <SignInRequiredStep
            firstName={signInFirstName}
            callbackUrl={`/events/${eventId}/register`}
            showGuestOption={false}
            onContinueAsGuest={() => {}}
          />
        </div>
      )}

      {step === 'otp_verify' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
          <div className="text-center">
            <p className="text-sm text-slate-600">We sent a 6-digit code to <span className="font-medium text-slate-900">{identifyEmail}</span></p>
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
            <button onClick={() => { setStep('identify'); setOtpCode(''); setOtpError(''); }} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">← Change email</button>
            <button onClick={handleSendCode} disabled={otpSending} className="text-primary-600 hover:text-primary-700">Resend code</button>
          </div>
        </div>
      )}

      {step === 'blocked' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-red-600" />
          </div>
          <p className="text-sm font-medium text-slate-900">{blockedMessage}</p>
          <p className="text-sm text-slate-500 mt-1">Join our community to register for this event.</p>
          <a href="/membership/apply" className="mt-4 btn-primary w-full inline-block text-center">
            Join as a Member
          </a>
        </div>
      )}

      {step === 'already_registered' && existingRegistration && (() => {
        const activeSelections = existingRegistration.itemSelections.filter((s) => s.status !== 'cancelled');
        const regTotal = parseFloat(existingRegistration.totalPrice || '0');
        const isPaid = existingRegistration.paymentStatus === 'paid';
        const registeredRows: SelectionSummaryRow[] = activeSelections.map((s) => {
          const catalogItem = items.find((it) => it.id === s.itemId);
          const entryType = catalogItem?.isActivity ? catalogItem.entryTypes?.find((et) => et.key === s.entryTypeKey) : undefined;
          const label = entryType ? `${s.itemName} (${entryType.label})` : s.itemName;
          let participants: string[] | undefined;
          if (catalogItem?.isActivity && s.participantNames) {
            try {
              const parsed: { name: string; fields?: Record<string, string> }[] = JSON.parse(s.participantNames);
              participants = parsed.filter((p) => p.name?.trim()).map((p) => {
                // Skip the first field — it doubles as this participant's name.
                const answers = (entryType?.participantFields || []).slice(1)
                  .map((f) => (p.fields?.[f.id] ? `${f.label}: ${p.fields[f.id]}` : null))
                  .filter((a): a is string => Boolean(a));
                return answers.length > 0 ? `${p.name} (${answers.join(', ')})` : p.name;
              });
            } catch { /* malformed participantNames JSON — omit the sub-list, label still shows */ }
          }
          return { label, amount: parseFloat(s.priceCharged || '0'), participants };
        });
        const registeredRoster = existingRegistration.participants
          .filter((p) => p.name?.trim())
          .map((p) => (p.age ? `${p.name} (${p.age})` : p.name));
        return (
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <HiOutlineCheckCircle className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 text-center mb-2">You&apos;re Registered</h2>
            <p className="text-xs text-slate-500 text-center mb-4">Here&apos;s your current registration for this event.</p>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Name</span>
                <span className="text-slate-900 font-medium">{existingRegistration.contactName}</span>
              </div>
              {regTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="text-slate-900 font-mono tabular-nums">
                    {formatCurrency(regTotal)}
                    {isPaid && <span className="text-green-600 ml-1">(Paid{existingRegistration.paymentMethod ? ` via ${existingRegistration.paymentMethod}` : ''})</span>}
                  </span>
                </div>
              )}
            </div>
            <div className="mb-6">
              <ItemsSelectionSummary rows={registeredRows} generalAttendanceRoster={registeredRoster} />
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
                <p className="text-xs text-center text-slate-400">Need to change your registration details? Contact the committee.</p>
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
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Cancel Registration</h2>
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-4 text-sm">
              <p className="font-medium text-slate-900">{existingRegistration.contactName}</p>
              {isPaid ? (
                <p className="text-slate-600 mt-1">
                  {formatCurrency(regTotal)} was paid{isAutoRefundable
                    ? ' and will be refunded to your original payment method.'
                    : ` via ${existingRegistration.paymentMethod || 'an offline method'} — our team will process your refund manually.`}
                </p>
              ) : (
                <p className="text-slate-600 mt-1">No payment is on file for this registration.</p>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-4">Are you sure you want to cancel? This cannot be undone.</p>
            {cancelError && <p className="text-sm text-red-500 mb-3">{cancelError}</p>}
            <div className="flex gap-2">
              <button onClick={handleCancelRegistration} disabled={cancelling} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {cancelling && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {cancelling ? 'Cancelling…' : 'Yes, Cancel Registration'}
              </button>
              <button onClick={() => setStep('already_registered')} disabled={cancelling} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">
                No, Keep It
              </button>
            </div>
          </div>
        );
      })()}

      {step === 'cancelled' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-900">Registration cancelled</p>
          <p className="text-sm text-slate-500 mt-1">{cancelRefundMessage || 'If a refund is due, it will be processed shortly.'}</p>
        </div>
      )}

      {step === 'items' && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select {terminology.itemNounPlural}</h2>
          {itemsError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{itemsError}</p>}
          {items.filter((i) => i.enabled && isItemVisibleToIdentity(i)).map((item) => {
            if (item.isActivity) return renderActivityItem(item);
            const selected = isSelected(item);
            const quantity = item.pricingMode === 'flat' ? 1 : (quantities[item.id] || 0);
            const price = priceFor(item);
            const lineItem = lineItems.find((li) => li.item.id === item.id);
            const tileTotal = lineItem?.price ?? 0;
            return (
              <div key={item.id} className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-start gap-3">
                  {item.pricingMode === 'flat' && !item.isGeneralAttendance ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={item.required || soldOut(item)}
                      onChange={(e) => toggleFlatItem(item, e.target.checked)}
                      className="mt-1 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      {price > 0 && item.pricingMode === 'flat' && (
                        <span className="font-mono tabular-nums text-sm text-slate-900 shrink-0">{formatCurrency(price)}</span>
                      )}
                    </div>
                    {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                    {(price > 0 || item.remainingCapacity != null) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {price > 0 && item.pricingMode !== 'flat' && <>{formatCurrency(price)} per {item.pricingMode === 'per_participant' ? 'person' : 'unit'}</>}
                        {price > 0 && item.pricingMode !== 'flat' && item.remainingCapacity != null && ' · '}
                        {item.remainingCapacity != null && `${item.remainingCapacity} left`}
                      </p>
                    )}
                    {item.pricingMode !== 'flat' && lineItem && lineItem.quantity > 1 && tileTotal > 0 && (
                      <p className="text-xs font-mono tabular-nums font-semibold text-slate-700 mt-1">
                        {lineItem.quantity} &times; {formatCurrency(price)} = {formatCurrency(tileTotal)}
                      </p>
                    )}
                  </div>
                  {item.pricingMode !== 'flat' && !item.isGeneralAttendance && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => setQuantity(item, quantity - 1)} disabled={quantity <= (item.required ? 1 : 0)} className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-300 disabled:opacity-30">
                        <HiOutlineMinus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-mono tabular-nums font-semibold">{quantity}</span>
                      <button type="button" onClick={() => setQuantity(item, quantity + 1)} disabled={soldOut(item)} className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-300 disabled:opacity-30">
                        <HiOutlinePlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {soldOut(item) && <p className="text-xs text-red-600 mt-1">Sold out</p>}
                {item.isGeneralAttendance ? (
                  <div className="mt-3 pl-3 border-l-2 border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">Who&apos;s attending?</p>
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
                            placeholder={`${terminology.participantNoun} name`}
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
                            <button onClick={() => setParticipants((ps) => ps.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600">
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <FieldError error={participantErrors[i]?.name || participantErrors[i]?.age} />
                      </div>
                    ))}
                    {(!maxAttendeesPerRegistration || participants.length < maxAttendeesPerRegistration) && (
                      <button onClick={() => setParticipants((ps) => [...ps, { name: '', age: '' }])} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                        <HiOutlinePlus className="w-4 h-4" /> Add Another {terminology.participantNoun}
                      </button>
                    )}
                  </div>
                ) : selected && item.customFields.length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-slate-200">
                    <DynamicFormRenderer
                      fields={item.customFields}
                      values={itemFieldValues[item.id] || {}}
                      onChange={(v) => setItemFieldValues((prev) => ({ ...prev, [item.id]: v }))}
                      errors={itemFieldErrors[item.id] || {}}
                      onValidate={(e) => setItemFieldErrors((prev) => ({ ...prev, [item.id]: e }))}
                      familyMembers={familyMembers}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {formConfig.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{additionalInfoHeading || 'Additional Information'}</h2>
              {additionalInfoSubheading && <p className="text-xs text-slate-500">{additionalInfoSubheading}</p>}
              <DynamicFormRenderer fields={formConfig} values={regFieldValues} onChange={setRegFieldValues} errors={regFieldErrors} onValidate={setRegFieldErrors} familyMembers={familyMembers} />
            </div>
          )}

          {/* Events with at least one item go straight from this cart step to
              Payment/Submit — the separate "details" step below never renders
              for them (it's only reached by itemless Survey-style events) —
              so Consent has to live here too, or those events would never
              show it at all. */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Consent</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailConsent}
                onChange={(e) => setEmailConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-600">
                I agree to receive event updates, newsletters, and community announcements via email. This applies to all registered {terminology.participantNounPlural.toLowerCase()}. You can unsubscribe at any time.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mediaConsent}
                onChange={(e) => setMediaConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-600">
                I grant permission for photos and videos taken during this event to be used on the organization&apos;s social media channels, YouTube, website, and promotional materials.
              </span>
            </label>
          </div>

          {total > 0 && <PriceDisplay breakdown={priceBreakdown} />}

          <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto bg-slate-900 rounded-t-xl p-4 z-20">
            <div className="flex items-center justify-between gap-4">
              {total > 0 && <span className="text-base font-bold text-white font-mono tabular-nums">{formatCurrency(total)}</span>}
              <button
                onClick={handleContinueFromItems}
                className="px-6 py-2.5 rounded-xl font-bold text-white transition-colors ml-auto"
                style={{ backgroundColor: 'var(--btn-color)' }}
              >
                {total > 0 ? 'Continue' : (isModifying ? 'Save' : terminology.actionVerb)}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3">
            <div>
              <label className="label">Your Name <span className="text-red-600">*</span></label>
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
                <div className="input flex items-center justify-between bg-slate-50 text-slate-500">
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
            <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{additionalInfoHeading || 'Additional Information'}</h2>
              {additionalInfoSubheading && <p className="text-xs text-slate-500">{additionalInfoSubheading}</p>}
              <DynamicFormRenderer fields={formConfig} values={regFieldValues} onChange={setRegFieldValues} errors={regFieldErrors} onValidate={setRegFieldErrors} familyMembers={familyMembers} />
            </div>
          )}

          <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Consent</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailConsent}
                onChange={(e) => setEmailConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-600">
                I agree to receive event updates, newsletters, and community announcements via email. This applies to all registered {terminology.participantNounPlural.toLowerCase()}. You can unsubscribe at any time.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mediaConsent}
                onChange={(e) => setMediaConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-600">
                I grant permission for photos and videos taken during this event to be used on the organization&apos;s social media channels, YouTube, website, and promotional materials.
              </span>
            </label>
          </div>

          {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}

          <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto bg-slate-900 rounded-t-xl p-4 z-20">
            <div className="flex items-center justify-between gap-4">
              {total > 0 && <span className="text-base font-bold text-white font-mono tabular-nums">{formatCurrency(total)}</span>}
              <button
                onClick={handleContinueFromDetails}
                className="px-6 py-2.5 rounded-xl font-bold text-white transition-colors ml-auto"
                style={{ backgroundColor: 'var(--btn-color)' }}
              >
                {total > 0 ? 'Continue to Payment' : (isModifying ? 'Save' : terminology.actionVerb)}
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
        <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-500">Submitting…</p>
        </div>
      )}

      {step === 'success' && successData && (
        <>
          <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <HiOutlineCheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm font-medium text-slate-900">
              {successData.registrationStatus === 'waitlist' ? "You're on the waitlist" : isUpdateSuccess ? 'Registration updated!' : 'All set!'}
            </p>
            {(successData.paymentMethod === 'zelle' || parseFloat(successData.totalPrice) > 0) && (
              <p className="text-sm text-slate-500 mt-1 font-mono tabular-nums">
                {successData.paymentMethod === 'zelle' ? 'Your Zelle payment will be verified shortly.' : `Total: ${formatCurrency(parseFloat(successData.totalPrice))}`}
              </p>
            )}
          </div>

          {(summaryRows.length > 0 || summaryRoster.length > 0) && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">What You Submitted</h2>
              <ItemsSelectionSummary rows={summaryRows} generalAttendanceRoster={summaryRoster} additionalInfo={summaryAdditionalInfo} />
            </div>
          )}

          {upcomingEvents && upcomingEvents.length > 0 && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">While you&apos;re here</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {upcomingEvents.map((ue, i) => {
                  const daysAway = Math.round((parseLocalDate(ue.date).getTime() - Date.now()) / 86400000);
                  return (
                    <a
                      key={ue.id}
                      href={`/events/${ue.id}/home`}
                      className="flex-none w-36 bg-white rounded-xl border border-slate-200 overflow-hidden no-underline"
                    >
                      <div className="h-14 bg-slate-800 relative flex items-center justify-center">
                        <img src={ue.categoryLogoUrl || '/logo.png'} alt="" className="w-8 h-8 rounded-md object-cover" />
                        {i === 0 && (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-bold uppercase tracking-wide bg-[var(--btn-color)] text-white px-1.5 py-0.5 rounded">Next</span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-slate-900 truncate">{ue.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                          {parseLocalDate(ue.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {daysAway >= 0 && ` · ${daysAway === 0 ? 'today' : `in ${daysAway}d`}`}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {submitError && (step === 'items' || step === 'details') && (
        <p className="text-sm text-red-600 mt-3">{submitError}</p>
      )}
      </div>
      <EventBottomNav eventId={eventId} active="register" eventDate={event.date} />
    </PublicLayout>
  );
}
