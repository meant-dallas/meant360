'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatDate, formatCurrency, fetchWithTimeout, parseAmount } from '@/lib/utils';
import { capturePaymentFlowError, addPaymentFlowBreadcrumb } from '@/lib/payment-observability';
import { useGoogleFallbackEmail } from '@/hooks/useGoogleFallbackEmail';
import PublicLayout from '@/components/events/PublicLayout';
import EventBottomNav from '@/components/events/EventBottomNav';
import AttendanceRoleToggle from '@/components/events/AttendanceRoleToggle';
import GoogleSignInChooser from '@/components/events/GoogleSignInChooser';
import PaymentForm from '@/components/events/PaymentForm';
import DynamicFormRenderer, { validateDynamicFields } from '@/components/events/DynamicFormRenderer';
import FieldError from '@/components/ui/FieldError';
import { validateName, validateAge, validateNameRequired } from '@/lib/validation';
import { calculateItemsPrice, collectGeneralAttendanceWaivedNames, countUnwaivedRosterNames, type ItemPriceInput } from '@/lib/pricing';
import toast from 'react-hot-toast';
import type { ItemsTerminology, ItemConfig, EntryTypeConfig, DiscountRules, EventPaymentConfig, MembershipTypeConfig } from '@/types';
import { HiOutlineCheckCircle, HiOutlineShieldCheck, HiOutlinePlus, HiOutlineTrash, HiOutlineExclamationTriangle } from 'react-icons/hi2';

interface EntryTypeWithCapacity extends EntryTypeConfig {
  remainingCapacity: number | null;
}

interface ItemWithCapacity extends ItemConfig {
  remainingCapacity: number | null;
  entryTypes?: EntryTypeWithCapacity[];
}

// A named performer on one Activity entry at the door — same shape
// ItemsRegisterClient's own ActivityEntryDraft uses, so pricing/validation
// stay identical between "registered ahead" and "walked in" Activities.
interface EntryParticipantDraft {
  name: string;
  fieldValues: Record<string, string>;
  fieldErrors: Record<string, string | null>;
}

interface ActivityEntryDraft {
  key: string;
  entryTypeKey: string;
  participants: EntryParticipantDraft[];
}

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
  totalPrice: string;
  paymentStatus: string;
  participants: Participant[];
}

interface ItemsCheckinClientProps {
  eventId: string;
  event: { name: string; date: string; categoryLogoUrl?: string; categoryBgColor?: string };
  terminology: ItemsTerminology;
  items: ItemWithCapacity[];
  // Sibling/multi-event/early-bird rules — needed so a walk-in's Activity
  // entries price identically to the same picks made ahead of time (see
  // calculateItemsPrice below).
  discountRules: DiscountRules;
  paymentConfig: EventPaymentConfig;
  feeSettings?: { paypalFeePercent?: number; paypalFeeFixed?: number; zelleEmail?: string; zellePhone?: string };
  // Event-wide cap across every Activity item's entries combined — mirrors
  // ItemsRegisterClient's own prop of the same name.
  remainingTotalActivitySlots?: number | null;
  maxTotalActivitySlots?: number | null;
  // Available renewal options for the on-demand renewal_required step — an
  // expired member must renew before check-in can proceed, but only once
  // they actually try to (see requiresRenewalNow).
  membershipTypes: MembershipTypeConfig[];
}

type Step = 'identify' | 'otp_verify' | 'renewal_required' | 'not_found' | 'walkin_payment' | 'registration_payment' | 'checkin';

interface LookupData {
  existingRegistration: Registration | null;
  isMember?: boolean;
  memberId?: string;
  familyMembers?: { name: string; age: string }[];
  requiresRenewal?: boolean;
  currentMembershipLevel?: string;
}

export default function ItemsCheckinClient({ eventId, event, terminology, items, discountRules, paymentConfig, feeSettings, remainingTotalActivitySlots = null, maxTotalActivitySlots = null, membershipTypes }: ItemsCheckinClientProps) {
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
  const [walkInIsParticipant, setWalkInIsParticipant] = useState(true);
  const [walkInError, setWalkInError] = useState('');
  const [walkInSaving, setWalkInSaving] = useState(false);

  // "Check in as a walk-in" — for someone with NO prior registration at all
  // (the not_found step). Shows the same General Attendance tile UI as the
  // register flow (named roster + price), then a payment step if the tile
  // isn't free, and creates+checks-in a brand-new registration on submit.
  // Distinct from addWalkIn above, which only grows an existing one.
  const gaItem = items.find((i) => i.enabled && i.isGeneralAttendance);
  const [newWalkInParticipants, setNewWalkInParticipants] = useState<{ name: string; age: string; isParticipant: boolean }[]>([{ name: '', age: '', isParticipant: true }]);
  const [newWalkInParticipantErrors, setNewWalkInParticipantErrors] = useState<Record<number, { name?: string | null; age?: string | null }>>({});
  const [newWalkInError, setNewWalkInError] = useState('');
  const [newWalkInSaving, setNewWalkInSaving] = useState(false);

  const filledWalkInParticipants = newWalkInParticipants.filter((p) => p.name.trim());
  // Only roster rows flagged "Participant" (not "Attendee") are eligible to
  // be picked as a named Activity entrant — same restriction
  // resolveSelections enforces server-side, so a walk-in can never end up
  // with an Activity entry naming someone the server will silently drop.
  const walkInParticipantRosterOptions = filledWalkInParticipants.filter((p) => p.isParticipant);

  // Activity items (Maths, Science, …) a walk-in can also register+pay for
  // at the door — keyed by itemId, each entry is one "Add entry" click.
  // Mirrors ItemsRegisterClient's own `entries` state/helpers below.
  const [walkInEntries, setWalkInEntries] = useState<Record<string, ActivityEntryDraft[]>>({});
  const [walkInItemFieldValues, setWalkInItemFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [walkInItemFieldErrors, setWalkInItemFieldErrors] = useState<Record<string, Record<string, string | null>>>({});

  const updateWalkInEntry = (itemId: string, entryKey: string, updater: (e: ActivityEntryDraft) => ActivityEntryDraft) => {
    setWalkInEntries((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).map((e) => (e.key === entryKey ? updater(e) : e)) }));
  };

  const updateWalkInEntryParticipant = (itemId: string, entryKey: string, index: number, updater: (p: EntryParticipantDraft) => EntryParticipantDraft) => {
    updateWalkInEntry(itemId, entryKey, (en) => ({ ...en, participants: en.participants.map((p, i) => (i === index ? updater(p) : p)) }));
  };

  const emptyWalkInParticipant = (): EntryParticipantDraft => ({ name: '', fieldValues: {}, fieldErrors: {} });

  // Same "server capacity numbers don't know about this not-yet-submitted
  // draft" problem ItemsRegisterClient solves — counts every entry already
  // added in this walk-in form so "Add Entry" stops offering a sold-out type.
  const localWalkInEntryTypeCounts = (itemId: string, excludeEntryKey?: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const e of walkInEntries[itemId] || []) {
      if (e.key === excludeEntryKey) continue;
      counts[e.entryTypeKey] = (counts[e.entryTypeKey] || 0) + 1;
    }
    return counts;
  };

  const walkInEntryTypeHasRoom = (et: EntryTypeWithCapacity, localCount: number): boolean =>
    et.remainingCapacity == null || et.remainingCapacity - localCount > 0;

  const totalDraftWalkInActivitySlots = (): number => Object.values(walkInEntries).reduce((sum, arr) => sum + arr.length, 0);

  const totalEventSlotsHasRoomForWalkIn = (additionalSlots: number): boolean =>
    remainingTotalActivitySlots == null || remainingTotalActivitySlots - totalDraftWalkInActivitySlots() - additionalSlots >= 0;

  const addWalkInEntry = (item: ItemWithCapacity) => {
    const entryTypes = item.entryTypes || [];
    const localCounts = localWalkInEntryTypeCounts(item.id);
    const typeKey = entryTypes.find((et) => walkInEntryTypeHasRoom(et, localCounts[et.key] || 0))?.key;
    if (!typeKey) return;
    if (!totalEventSlotsHasRoomForWalkIn(1)) return;
    setWalkInEntries((prev) => ({
      ...prev,
      [item.id]: [
        ...(prev[item.id] || []),
        { key: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, entryTypeKey: typeKey, participants: [emptyWalkInParticipant()] },
      ],
    }));
  };

  const removeWalkInEntry = (itemId: string, entryKey: string) => {
    setWalkInEntries((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).filter((e) => e.key !== entryKey) }));
  };

  const switchWalkInEntryType = (item: ItemWithCapacity, entryKey: string, newTypeKey: string) => {
    const newType = (item.entryTypes || []).find((et) => et.key === newTypeKey);
    updateWalkInEntry(item.id, entryKey, (en) => ({
      ...en,
      entryTypeKey: newTypeKey,
      // A different entry type can ask different participant questions —
      // keep names (still valid, roster-restricted), drop stale answers.
      participants: en.participants.map((p) => ({ ...p, fieldValues: {}, fieldErrors: {} })).slice(0, Math.max(1, newType?.maxParticipants ?? en.participants.length)),
    }));
  };

  // Every walk-in Activity entry across every Activity item, flattened into
  // one priceable row each — identical shape to ItemsRegisterClient's own
  // activityLineItems, so calculateItemsPrice below prices it identically.
  const walkInActivityLineItems = useMemo(() => {
    const result: { item: ItemWithCapacity; entry: ActivityEntryDraft; entryType: EntryTypeConfig; quantity: number; price: number }[] = [];
    for (const item of items) {
      if (!item.isActivity || !item.enabled) continue;
      for (const entry of walkInEntries[item.id] || []) {
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
  }, [items, walkInEntries, isMember]);

  // Whenever this event actually offers a paid Activity to this identity,
  // a walk-in must pick at least one before checking in — otherwise staff
  // could skip straight to "Check In as Walk-in" and collect only the (often
  // free/cheap) General Attendance fee, silently never charging for the
  // Activity the person actually came for. Always enforced for walk-ins,
  // independent of the catalog's activitySelectionRequired toggle (which
  // only governs the full ahead-of-time register flow).
  const hasEnabledWalkInActivityItem = useMemo(
    () => items.some((i) => i.isActivity && i.enabled && (isMember ? i.visibleToMembers !== false : i.visibleToGuests !== false)),
    [items, isMember],
  );
  const walkInActivitySelectionMissing = hasEnabledWalkInActivityItem && walkInActivityLineItems.length === 0;

  const walkInUnitPrice = gaItem ? (isMember ? gaItem.memberPrice : gaItem.guestPrice) : 0;
  const walkInQuantity = Math.max(1, filledWalkInParticipants.length);
  // An Activity entry whose item waivesGeneralAttendance already covers that
  // person's attendance fee — same waiver calculateItemsPrice (via its GA
  // amount input below) and the server both apply, so this estimate can
  // never show/charge more than what gets stored on submit.
  const walkInWaivedGaNames = useMemo(() => collectGeneralAttendanceWaivedNames(
    walkInActivityLineItems.map(({ item, entry }) => ({
      isActivity: true,
      waivesGeneralAttendance: item.waivesGeneralAttendance,
      participantNames: entry.participants.filter((p) => p.name.trim()).map((p) => p.name),
    })),
  ), [walkInActivityLineItems]);
  const walkInGaQuantity = gaItem?.pricingMode === 'per_participant'
    ? countUnwaivedRosterNames(filledWalkInParticipants.map((p) => p.name), walkInWaivedGaNames)
    : walkInQuantity;
  const walkInGaAmount = gaItem ? (gaItem.pricingMode === 'flat' ? walkInUnitPrice : walkInUnitPrice * walkInGaQuantity) : 0;

  const walkInPriceBreakdown = useMemo(() => calculateItemsPrice(
    [
      ...(gaItem ? [{
        itemId: gaItem.id,
        itemName: gaItem.name,
        pricingMode: gaItem.pricingMode,
        unitPrice: walkInUnitPrice,
        quantity: walkInGaQuantity,
        amount: walkInGaAmount,
        isGeneralAttendance: true,
      } as ItemPriceInput] : []),
      ...walkInActivityLineItems.map(({ item, entry, entryType, quantity, price }) => ({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [gaItem, walkInUnitPrice, walkInGaQuantity, walkInGaAmount, walkInActivityLineItems, discountRules, isMember]);
  const walkInTotal = walkInPriceBreakdown.total;

  // An expired member is never a guest (see event-items.service.ts) — but
  // unlike a hard block on page load, this no longer stops them from seeing
  // their roster/walk-in form: it's collected the first time an action that
  // actually needs payment is attempted (Complete Check-In, add a walk-in
  // attendee, or the brand-new walk-in registration's own payment step),
  // mirroring how ItemsRegisterClient folds the same fee into whichever
  // payment step actually fires instead of gating before anything is shown.
  const [requiresRenewal, setRequiresRenewal] = useState(false);
  const [selectedMembershipType, setSelectedMembershipType] = useState<MembershipTypeConfig | null>(null);
  // Which step to return to once the on-demand renewal payment (below)
  // succeeds or is cancelled — never 'identify': cancelling must not throw
  // away a verified identity and the in-progress selection/roster.
  const [renewalReturnStep, setRenewalReturnStep] = useState<Step>('checkin');
  // The just-captured renewal payment, not yet applied server-side — carried
  // into whichever action comes next (a participant's check-in, or a
  // brand-new walk-in registration), since those are the OTP-aware
  // endpoints that can actually apply it (unlike /api/members/renew, which
  // requires a real NextAuth session check-in never has). Cleared the
  // moment one of those calls succeeds — the member's status is Active in
  // the DB by then, so there's nothing left to apply.
  const [pendingMembershipRenewal, setPendingMembershipRenewal] = useState<{ membershipType: string; amount: string; paymentMethod: string; transactionId: string } | null>(null);

  // The just-captured payment for an existing registration's outstanding
  // balance (pre-registered but never paid, or underpaid) — carried into
  // the next "Complete Check-In" call, which is the only endpoint that can
  // apply it. Cleared once that call succeeds; registration.paymentStatus
  // is updated locally at the same time so re-opening this step later
  // (e.g. to check in the rest of the party) doesn't ask again.
  const [pendingRegistrationPayment, setPendingRegistrationPayment] = useState<{ paymentStatus: string; paymentMethod: string; transactionId: string } | null>(null);

  const continueAfterLookup = (data: LookupData) => {
    if (!data.existingRegistration || data.existingRegistration.registrationStatus === 'cancelled') {
      setStep('not_found');
      return;
    }
    setRegistration(data.existingRegistration);
    // Default every not-yet-checked-in attendee to selected — the front
    // desk is checking in the whole party in the common case, so "toggle
    // everyone off who isn't here" is less friction than "toggle everyone
    // on who is."
    setSelectedForCheckin(new Set(data.existingRegistration.participants.filter((p) => !p.checkedInAt).map((p) => p.id)));
    setStep('checkin');
  };

  const applyLookup = (data: LookupData) => {
    setIsMember(!!data.isMember);
    setMemberId(data.memberId || '');
    setFamilyMembers(data.familyMembers || []);
    setRequiresRenewal(!!data.requiresRenewal);

    if (data.requiresRenewal) {
      // Settings names the tier "Family Membership" etc. while Member.membershipLevel
      // stores the bare level ("Family") — match on prefix rather than equality.
      const level = (data.currentMembershipLevel || '').toLowerCase();
      const match = level ? membershipTypes.find((t) => t.name.toLowerCase().startsWith(level)) : undefined;
      setSelectedMembershipType(match || membershipTypes[0] || null);
    } else {
      setSelectedMembershipType(null);
    }

    continueAfterLookup(data);
  };

  // Reached on demand (not on page load) the first time an action needing
  // payment is attempted while a renewal is still owed — see
  // requiresRenewalNow below.
  const handleRenewalPaymentSuccess = (result: { method: 'square' | 'paypal' | 'zelle'; transactionId: string }) => {
    if (!selectedMembershipType) return;
    setPendingMembershipRenewal({
      membershipType: selectedMembershipType.name,
      amount: String(selectedMembershipType.price),
      paymentMethod: result.method,
      transactionId: result.transactionId,
    });
    setStep(renewalReturnStep);
  };

  // True once, until the renewal is actually paid — callers check this
  // before firing a payment-free action and redirect to the renewal step
  // instead when it's still true.
  const requiresRenewalNow = requiresRenewal && !pendingMembershipRenewal;

  // What's still owed on the registration itself — applies equally to
  // members and guests since both share the same paymentStatus/totalPrice
  // fields (see event-items.service.ts's PaymentRequiredError gate).
  const registrationOutstandingBalance = registration && !pendingRegistrationPayment && registration.paymentStatus !== 'paid'
    ? parseAmount(registration.totalPrice)
    : 0;

  // Landed here by the NextAuth Google-fallback redirect (see auth.ts's
  // signIn callback) — an OTP for this email was already sent server-side,
  // so jump straight to code entry instead of showing the chooser again or
  // trying to resume a session that was never created. viaGoogleFallback
  // drives the explanatory copy on the otp_verify step below — only for
  // this path, never the normal manual Email chooser.
  const googleFallbackEmail = useGoogleFallbackEmail();
  const [viaGoogleFallback, setViaGoogleFallback] = useState(false);
  // The ?verifyEmail= query param stays in the URL after landing here
  // (nothing strips it), so without this flag "Go back" would set step
  // back to 'identify' only for this same effect to immediately fire again
  // and snap straight back to otp_verify — looking like the button does
  // nothing. Set once the user explicitly backs out; never reset.
  const googleFallbackDismissed = useRef(false);
  useEffect(() => {
    if (!googleFallbackEmail || googleFallbackDismissed.current || step !== 'identify') return;
    sessionResumeTried.current = true;
    setEmail(googleFallbackEmail);
    setViaGoogleFallback(true);
    setStep('otp_verify');
  }, [googleFallbackEmail, step]);

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
        body: JSON.stringify({ action: 'send', email: email.trim() }),
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
    if (requiresRenewalNow) { setRenewalReturnStep('checkin'); setStep('renewal_required'); return; }
    if (registrationOutstandingBalance > 0) { setStep('registration_payment'); return; }
    const participantIds = Array.from(selectedForCheckin);
    const isPaid = !!pendingRegistrationPayment;
    setCompletingCheckin(true);
    if (isPaid) addPaymentFlowBreadcrumb('registration checkin save started', { eventId, paymentMethod: pendingRegistrationPayment!.paymentMethod, transactionId: pendingRegistrationPayment!.transactionId });
    try {
      const res = await fetchWithTimeout(`/api/events/${eventId}/items-registrations/${registration.id}/checkin-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantIds,
          ...(pendingMembershipRenewal ? { membershipRenewal: pendingMembershipRenewal } : {}),
          ...(pendingRegistrationPayment ? { payment: pendingRegistrationPayment } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        const checkedIn = json.data.checkedIn as { id: string; checkedInAt: string }[];
        const failed = json.data.failed as { participantId: string; error: string }[];
        const checkedInById = new Map(checkedIn.map((p) => [p.id, p.checkedInAt]));
        setRegistration((r) => r && ({
          ...r,
          // Reflects server-side state once the payment above has actually
          // been applied — keeps registrationOutstandingBalance at 0 if the
          // front desk comes back to check in the rest of the party later.
          ...(pendingRegistrationPayment ? { paymentStatus: pendingRegistrationPayment.paymentStatus } : {}),
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
        // status is Active now, so nothing left to carry into later calls,
        // and later actions (e.g. a second batch, or adding a walk-in) must
        // not re-trigger the renewal gate.
        setPendingMembershipRenewal(null);
        setRequiresRenewal(false);
        setPendingRegistrationPayment(null);
        if (isPaid) addPaymentFlowBreadcrumb('registration checkin save succeeded', { eventId, transactionId: pendingRegistrationPayment!.transactionId });
      } else {
        // Payment already captured (isPaid) but the check-in save failed —
        // the money-at-risk case worth reporting, same as a walk-in's save.
        if (isPaid) {
          capturePaymentFlowError(new Error(json.error || 'Failed to check in'), {
            context: 'Registration checkin save failed after payment', eventId, paymentMethod: pendingRegistrationPayment!.paymentMethod, transactionId: pendingRegistrationPayment!.transactionId,
          });
        }
        toast.error(json.error || 'Failed to check in');
      }
    } catch (err) {
      if (isPaid) {
        capturePaymentFlowError(err, {
          context: 'Registration checkin save request failed after payment', eventId, paymentMethod: pendingRegistrationPayment!.paymentMethod, transactionId: pendingRegistrationPayment!.transactionId,
        });
      }
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
    if (requiresRenewalNow) { setRenewalReturnStep('checkin'); setStep('renewal_required'); return; }
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
        setSelectedForCheckin((prev) => new Set(prev).add(json.data.participant.id));
        setWalkInName('');
        setWalkInAge('');
        setWalkInIsParticipant(false);
        setAddingWalkIn(false);
        setPendingMembershipRenewal(null);
        setRequiresRenewal(false);
      } else {
        setWalkInError(json.error || `Failed to add ${terminology.participantNoun.toLowerCase()}`);
      }
    } catch {
      setWalkInError(`Failed to add ${terminology.participantNoun.toLowerCase()}`);
    } finally {
      setWalkInSaving(false);
    }
  };

  // Same row shape the register flow's buildItemSelections sends — one row
  // per Activity entry, plus the item-level customFields duplicated onto
  // every entry/selection row for that item (asked once regardless of how
  // many entries exist).
  const buildWalkInActivitySelections = () => walkInActivityLineItems.map(({ item, entry, entryType }) => ({
    itemId: item.id,
    entryTypeKey: entryType.key,
    quantity: Math.max(1, entry.participants.filter((p) => p.name.trim()).length || 1),
    customFieldResponses: walkInItemFieldValues[item.id] || {},
    participants: entry.participants
      .filter((p) => p.name.trim())
      .map((p) => ({ name: p.name, fields: p.fieldValues })),
  }));

  // Validates the roster and any Activity entries, then either submits
  // directly (free tile) or hands off to the payment step — mirrors
  // handleContinueFromItems in the register flow's items step.
  const handleContinueFromWalkIn = () => {
    setNewWalkInError('');
    const newErrors: Record<number, { name?: string | null; age?: string | null }> = {};
    let hasError = false;
    newWalkInParticipants.forEach((p, i) => {
      const nErr = validateNameRequired(p.name);
      const aErr = validateAge(p.age);
      if (nErr || aErr) hasError = true;
      newErrors[i] = { name: nErr, age: aErr };
    });
    setNewWalkInParticipantErrors(newErrors);
    if (hasError) return;

    // Defense-in-depth backstop — the submit button is already disabled
    // whenever this is true (see walkInActivitySelectionMissing), so
    // reaching here with it still true shouldn't normally happen.
    if (walkInActivitySelectionMissing) {
      setNewWalkInError(`Please select at least one ${terminology.activityNoun.toLowerCase()} to continue.`);
      return;
    }

    // Item-level customFields are answered once per Activity item, as long
    // as at least one entry has been added for it.
    let firstInvalidItemName = '';
    for (const item of items) {
      if (!item.isActivity || (walkInEntries[item.id] || []).length === 0) continue;
      const fieldErrors = validateDynamicFields(item.customFields, walkInItemFieldValues[item.id] || {});
      setWalkInItemFieldErrors((prev) => ({ ...prev, [item.id]: fieldErrors }));
      if (!firstInvalidItemName && Object.values(fieldErrors).some(Boolean)) firstInvalidItemName = item.name;
    }

    let firstEntryError = '';
    for (const item of items) {
      if (!item.isActivity) continue;
      for (const entry of walkInEntries[item.id] || []) {
        const entryType = (item.entryTypes || []).find((et) => et.key === entry.entryTypeKey);
        const minP = Math.max(1, entryType?.minParticipants ?? 1);
        const filled = entry.participants.filter((p) => p.name.trim());

        let hasParticipantFieldError = false;
        const participantFields = entryType?.participantFields || [];
        entry.participants.forEach((p, i) => {
          if (!p.name.trim()) return;
          const pErrors = validateDynamicFields(participantFields, p.fieldValues);
          if (Object.values(pErrors).some(Boolean)) hasParticipantFieldError = true;
          updateWalkInEntryParticipant(item.id, entry.key, i, (x) => ({ ...x, fieldErrors: pErrors }));
        });

        if (firstEntryError) continue; // keep validating (side effects above), but only report the first problem
        const entryLabel = entryType ? `${item.name} (${entryType.label})` : item.name;
        if (filled.length < minP) {
          const noun = minP === 1 ? terminology.participantNoun.toLowerCase() : terminology.participantNounPlural.toLowerCase();
          firstEntryError = `"${entryLabel}" needs at least ${minP} ${noun} — you've entered ${filled.length}.`;
        } else if (hasParticipantFieldError) {
          firstEntryError = `Please fill in required information for "${entryLabel}".`;
        }
      }
    }

    if (firstInvalidItemName) { setNewWalkInError(`Please fill in required information for "${firstInvalidItemName}".`); return; }
    if (firstEntryError) { setNewWalkInError(firstEntryError); return; }

    if (walkInTotal > 0 || requiresRenewalNow) {
      setStep('walkin_payment');
    } else {
      submitWalkInCheckin({ paymentStatus: 'paid', paymentMethod: 'free', transactionId: '' });
    }
  };

  const submitWalkInCheckin = async (
    payment: { paymentStatus: string; paymentMethod: string; transactionId: string },
    membershipRenewal?: { membershipType: string; amount: string; paymentMethod: string; transactionId: string },
  ) => {
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
          itemSelections: buildWalkInActivitySelections(),
          ...payment,
          ...(membershipRenewal ? { membershipRenewal } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        addPaymentFlowBreadcrumb('walk-in checkin save succeeded', { eventId, transactionId: payment.transactionId });
        toast.success('Checked in');
        setRegistration(json.data);
        setStep('checkin');
        setPendingMembershipRenewal(null);
        setRequiresRenewal(false);
        setWalkInEntries({});
        setWalkInItemFieldValues({});
        setWalkInItemFieldErrors({});
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

  // A walk-in's own named participant names ARE the GA roster above
  // ("Who's attending?") — an Activity entry can only name someone already
  // flagged "Participant" there (walkInParticipantRosterOptions), never a
  // free-typed name, same rule DynamicFormRenderer's restrictedNameOptions
  // enforces for the full register flow.
  const renderWalkInActivityItem = (item: ItemWithCapacity) => {
    const entryTypes = item.entryTypes || [];
    const itemEntries = walkInEntries[item.id] || [];
    const localCounts = localWalkInEntryTypeCounts(item.id);
    const allEntryTypesSoldOut = entryTypes.length > 0 && entryTypes.every((et) => !walkInEntryTypeHasRoom(et, localCounts[et.key] || 0));
    const eventSlotsFull = !totalEventSlotsHasRoomForWalkIn(1);
    const allSoldOut = allEntryTypesSoldOut || eventSlotsFull;

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
                        onChange={(e) => switchWalkInEntryType(item, entry.key, e.target.value)}
                        className="select flex-1"
                      >
                        {entryTypes.map((et) => {
                          const localCountsExcl = localWalkInEntryTypeCounts(item.id, entry.key);
                          const soldOutType = et.key !== entry.entryTypeKey && !walkInEntryTypeHasRoom(et, localCountsExcl[et.key] || 0);
                          return (
                            <option key={et.key} value={et.key} disabled={soldOutType}>
                              {et.label}{soldOutType ? ' (No availability)' : ''}
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
                    const nameField = participantFields.find((f) => f.type === 'name');
                    return (
                      <div key={i} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <DynamicFormRenderer
                              fields={participantFields}
                              values={p.fieldValues}
                              onChange={(v) => updateWalkInEntryParticipant(item.id, entry.key, i, (x) => ({
                                ...x,
                                fieldValues: v,
                                name: nameField ? (v[nameField.id] || '') : x.name,
                              }))}
                              errors={p.fieldErrors}
                              onValidate={(e) => updateWalkInEntryParticipant(item.id, entry.key, i, (x) => ({ ...x, fieldErrors: e }))}
                              restrictedNameOptions={walkInParticipantRosterOptions}
                            />
                          </div>
                          {entry.participants.length > 1 && (
                            <button
                              onClick={() => updateWalkInEntry(item.id, entry.key, (en) => ({ ...en, participants: en.participants.filter((_, j) => j !== i) }))}
                              className="p-2 mt-0.5 text-slate-400 hover:text-red-600"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(!maxP || entry.participants.length < maxP) && (
                    <button
                      onClick={() => updateWalkInEntry(item.id, entry.key, (en) => ({ ...en, participants: [...en.participants, emptyWalkInParticipant()] }))}
                      className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
                    >
                      <HiOutlinePlus className="w-3.5 h-3.5" /> Add {terminology.participantNoun}
                    </button>
                  )}
                  <div className="text-right">
                    <button onClick={() => removeWalkInEntry(item.id, entry.key)} className="text-xs text-slate-400 hover:text-red-600 underline">
                      Remove this entry
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {itemEntries.length > 0 && item.customFields.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <DynamicFormRenderer
              fields={item.customFields}
              values={walkInItemFieldValues[item.id] || {}}
              onChange={(v) => setWalkInItemFieldValues((prev) => ({ ...prev, [item.id]: v }))}
              errors={walkInItemFieldErrors[item.id] || {}}
              onValidate={(e) => setWalkInItemFieldErrors((prev) => ({ ...prev, [item.id]: e }))}
              restrictedNameOptions={walkInParticipantRosterOptions}
            />
          </div>
        )}

        {entryTypes.length === 0 || allSoldOut ? null : (
          <div className="mt-3">
            <button
              onClick={() => addWalkInEntry(item)}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: 'var(--btn-color)' }}
            >
              <HiOutlinePlus className="w-4 h-4" /> Add {entryTypes.length === 1 ? entryTypes[0].label : terminology.entryNoun}
            </button>
            {entryTypes.length === 1 && entryTypes[0].capacity ? (
              <p className="text-xs text-slate-400 mt-0.5">
                {Math.max(0, (entryTypes[0].remainingCapacity ?? entryTypes[0].capacity) - (localCounts[entryTypes[0].key] || 0))} of {entryTypes[0].capacity} available
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
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
          <GoogleSignInChooser eventId={eventId} mode="checkin" />
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
          {viaGoogleFallback && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">We couldn&apos;t match your Google account to a member on file. Please enter the OTP code received to proceed as a guest.</p>
            </div>
          )}
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
            <button onClick={() => { googleFallbackDismissed.current = true; setStep('identify'); setOtpCode(''); setOtpError(''); setViaGoogleFallback(false); }} className="text-slate-500 hover:text-slate-700">{viaGoogleFallback ? '← Go back' : '← Change email'}</button>
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
              onCancel={() => setStep(renewalReturnStep)}
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

          {requiresRenewalNow && selectedMembershipType && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Membership Renewal</p>
                <p className="text-xs text-slate-500">{selectedMembershipType.name} — added to this check-in</p>
              </div>
              <span className="text-sm font-bold text-slate-900 font-mono tabular-nums shrink-0">{formatCurrency(selectedMembershipType.price)}</span>
            </div>
          )}

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
                    onClick={() => setNewWalkInParticipants([{ name: '', age: '', isParticipant: true }, ...familyMembers.map((m) => ({ ...m, isParticipant: true }))])}
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
                      onBlur={() => setNewWalkInParticipantErrors((prev) => ({ ...prev, [i]: { ...prev[i], age: validateAge(p.age) } }))}
                      className={`input w-20 ${newWalkInParticipantErrors[i]?.age ? 'border-red-500' : ''}`}
                      placeholder="Age"
                    />
                    {newWalkInParticipants.length > 1 && (
                      <button onClick={() => setNewWalkInParticipants((ps) => ps.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <AttendanceRoleToggle
                      name={`attendance-role-${i}`}
                      isParticipant={p.isParticipant}
                      onChange={(v) => setNewWalkInParticipants((ps) => ps.map((x, j) => (j === i ? { ...x, isParticipant: v } : x)))}
                      attendeeLabel={terminology.attendeeRoleLabel}
                      participantLabel={terminology.participantRoleLabel}
                    />
                  </div>
                  <FieldError error={newWalkInParticipantErrors[i]?.name || newWalkInParticipantErrors[i]?.age} />
                </div>
              ))}
              <button onClick={() => setNewWalkInParticipants((ps) => [...ps, { name: '', age: '', isParticipant: true }])} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                <HiOutlinePlus className="w-4 h-4" /> Add Another {terminology.participantNoun}
              </button>
            </div>
            {walkInTotal > 0 && (
              <p className="text-xs font-mono tabular-nums font-semibold text-slate-700 mt-3 pt-3 border-t border-slate-100">
                Total: {formatCurrency(walkInTotal)}
              </p>
            )}
          </div>

          {/* Activity items (Maths, Science, …) a walk-in can also register
              and pay for at the door, priced identically to the same picks
              made ahead of time — see renderWalkInActivityItem. */}
          {items
            .filter((i) => i.enabled && i.isActivity && (isMember ? i.visibleToMembers !== false : i.visibleToGuests !== false))
            .map(renderWalkInActivityItem)}

          {walkInActivitySelectionMissing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Select at least one {terminology.activityNoun.toLowerCase()} above before checking in.
            </p>
          )}
          {newWalkInError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{newWalkInError}</p>}
          <button onClick={handleContinueFromWalkIn} disabled={newWalkInSaving || walkInActivitySelectionMissing} className="btn-primary w-full disabled:opacity-50">
            {newWalkInSaving ? 'Checking in…' : (walkInTotal > 0 || requiresRenewalNow) ? 'Continue to Payment' : 'Check In as Walk-in'}
          </button>
          <button onClick={() => { setStep('identify'); setEmail(''); setNewWalkInError(''); setWalkInEntries({}); setWalkInItemFieldValues({}); setWalkInItemFieldErrors({}); }} className="text-xs text-slate-500 hover:text-slate-700 w-full text-center">
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
            membershipRenewal={requiresRenewalNow && selectedMembershipType ? { membershipType: selectedMembershipType.name, amount: selectedMembershipType.price } : undefined}
            onSuccess={(result) => {
              const payment = {
                paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
                paymentMethod: result.method,
                transactionId: result.transactionId,
              };
              const membershipRenewalPayload = requiresRenewalNow && selectedMembershipType ? {
                membershipType: selectedMembershipType.name,
                amount: String(selectedMembershipType.price),
                paymentMethod: result.method,
                transactionId: result.membershipTransactionId || '',
              } : undefined;
              submitWalkInCheckin(payment, membershipRenewalPayload);
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

      {step === 'registration_payment' && registration && (
        <div className="space-y-3">
          <button onClick={() => setStep('checkin')} className="btn-secondary text-sm">← Back</button>
          <PaymentForm
            amount={registrationOutstandingBalance}
            eventId={eventId}
            eventName={event.name}
            payerName={registration.contactName}
            payerEmail={email}
            onSuccess={(result) => {
              setPendingRegistrationPayment({
                paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
                paymentMethod: result.method,
                transactionId: result.transactionId,
              });
              setStep('checkin');
            }}
            onCancel={() => setStep('checkin')}
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
        <div className="space-y-3">
        {requiresRenewalNow && selectedMembershipType && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Membership Renewal</p>
              <p className="text-xs text-slate-500">{selectedMembershipType.name} — required to complete check-in</p>
            </div>
            <span className="text-sm font-bold text-slate-900 font-mono tabular-nums shrink-0">{formatCurrency(selectedMembershipType.price)}</span>
          </div>
        )}
        {!requiresRenewalNow && registrationOutstandingBalance > 0 && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Payment Required</p>
              <p className="text-xs text-slate-500">Balance due before check-in can be completed</p>
            </div>
            <span className="text-sm font-bold text-slate-900 font-mono tabular-nums shrink-0">{formatCurrency(registrationOutstandingBalance)}</span>
          </div>
        )}
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
                      role="switch"
                      aria-checked={selected}
                      aria-label={selected ? `Deselect ${p.name}` : `Select ${p.name}`}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                        selected ? 'bg-green-500' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                          selected ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              );
            })}
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
                <AttendanceRoleToggle
                  name="walkin-attendance-role"
                  isParticipant={walkInIsParticipant}
                  onChange={setWalkInIsParticipant}
                  attendeeLabel={terminology.attendeeRoleLabel}
                  participantLabel={terminology.participantRoleLabel}
                />
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
          <div className="px-4 py-3 border-t border-slate-100">
            <button
              onClick={handleCompleteCheckin}
              disabled={completingCheckin || selectedForCheckin.size === 0}
              className="btn-primary w-full disabled:opacity-50"
            >
              {completingCheckin
                ? 'Checking in…'
                : (requiresRenewalNow || registrationOutstandingBalance > 0)
                  ? 'Continue to Payment'
                  : `Complete Check-In (${selectedForCheckin.size})`}
            </button>
          </div>
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
