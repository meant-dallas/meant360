'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PublicLayout from '@/components/events/PublicLayout';
import PriceDisplay from '@/components/events/PriceDisplay';
import PaymentForm from '@/components/events/PaymentForm';
import ActivitySelector from '@/components/events/ActivitySelector';
import StatusBadge from '@/components/ui/StatusBadge';
import ProfileReviewStep from '@/components/events/ProfileReviewStep';
import { parsePricingRules, calculatePrice, calculateActivityPrice } from '@/lib/pricing';
import { parseFormConfig, parseActivities, parseActivityPricingMode, parseGuestPolicy } from '@/lib/event-config';
import { validateEmail, validateEmailRequired, validatePhone, validateNameRequired } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import type { PricingRules, PriceBreakdown, FeeSettings, FormFieldConfig, ActivityConfig, ActivityPricingMode, GuestPolicy, ActivityRegistration } from '@/types';
import { HiOutlineCheckCircle, HiOutlineHeart, HiOutlineExclamationTriangle, HiCheck } from 'react-icons/hi2';
import { analytics } from '@/lib/analytics';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

type Step = 'loading' | 'identify' | 'sign_in_required' | 'membership_offer' | 'membership_expired' | 'already_registered' | 'wizard' | 'payment' | 'submitting' | 'success' | 'error';
type WizardStep = 'contact' | 'profile_review' | 'attendees' | 'activities' | 'review';

const WIZARD_LABELS: Record<WizardStep, string> = {
  contact: 'Contact',
  profile_review: 'Profile',
  attendees: 'Attendees',
  activities: 'Activities',
  review: 'Review',
};

interface RegistrationData {
  participantId: string;
  registeredAdults: number;
  registeredKids: number;
  selectedActivities: string;
  customFields: string;
  totalPrice: string;
  paymentStatus: string;
}

interface LookupResult {
  status: string;
  memberId?: string;
  guestId?: string;
  name?: string;
  email?: string;
  phone?: string;
  homePhone?: string;
  cellPhone?: string;
  address?: string;
  qualifyingDegree?: string;
  nativePlace?: string;
  college?: string;
  jobTitle?: string;
  employer?: string;
  specialInterests?: string;
  spouseName?: string;
  spouseEmail?: string;
  spousePhone?: string;
  children?: string;
  membershipType?: string;
  membershipLevel?: string;
  memberStatus?: string;
  payments?: string;
  sponsors?: string;
  city?: string;
  referredBy?: string;
  guestPolicy?: GuestPolicy;
  registrationData?: RegistrationData;
}

export default function RegisterPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const autoLookupDone = useRef(false);

  const [step, setStep] = useState<Step>('loading');
  const [wizardStep, setWizardStep] = useState<WizardStep>('attendees');
  const [eventName, setEventName] = useState('');
  const [categoryLogoUrl, setCategoryLogoUrl] = useState('');
  const [categoryBgColor, setCategoryBgColor] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [adults, setAdults] = useState(1);
  const [freeKids, setFreeKids] = useState(0);
  const [paidKids, setPaidKids] = useState(0);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [regType, setRegType] = useState<'Member' | 'Guest'>('Guest');

  const [formFields, setFormFields] = useState<FormFieldConfig[]>([]);
  const [eventActivities, setEventActivities] = useState<ActivityConfig[]>([]);
  const [actPricingMode, setActPricingMode] = useState<ActivityPricingMode>('flat');
  const [guestPolicy, setGuestPolicy] = useState<GuestPolicy | null>(null);
  const [activityRegistrations, setActivityRegistrations] = useState<ActivityRegistration[]>([]);
  const [noParticipation, setNoParticipation] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const [paymentInfo, setPaymentInfo] = useState<{
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
  }>({ paymentStatus: '', paymentMethod: '', transactionId: '' });
  const [pendingRegType, setPendingRegType] = useState<'Member' | 'Guest'>('Guest');

  // Modification mode state
  const [isModifying, setIsModifying] = useState(false);
  const [existingParticipantId, setExistingParticipantId] = useState('');
  const [originalPaidAmount, setOriginalPaidAmount] = useState(0);

  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);
  const [membershipCost, setMembershipCost] = useState(0);
  const [isRenewing, setIsRenewing] = useState(false);

  const [memberProfile, setMemberProfile] = useState<{
    phone: string;
    homePhone: string;
    cellPhone: string;
    qualifyingDegree: string;
    nativePlace: string;
    college: string;
    jobTitle: string;
    employer: string;
    specialInterests: string;
    address: { street: string; street2: string; city: string; state: string; zipCode: string; country: string } | null;
    spouse: { firstName: string; middleName: string; lastName: string; email: string; phone: string } | null;
    children: { name: string; age: string; sex?: string; grade?: string; dateOfBirth?: string }[];
    membershipType: string;
    membershipLevel: string;
    memberStatus: string;
    payments: { product: string; amount: string; payerName: string; payerEmail: string; transactionId: string }[];
    sponsors: { name: string; email: string; phone: string }[];
  } | null>(null);
  const [profileChanged, setProfileChanged] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    referredBy: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const buildMemberProfile = (data: LookupResult) => ({
    phone: data.phone || '',
    homePhone: data.homePhone || '',
    cellPhone: data.cellPhone || '',
    qualifyingDegree: data.qualifyingDegree || '',
    nativePlace: data.nativePlace || '',
    college: data.college || '',
    jobTitle: data.jobTitle || '',
    employer: data.employer || '',
    specialInterests: data.specialInterests || '',
    address: null as { street: string; street2: string; city: string; state: string; zipCode: string; country: string } | null,
    spouse: (data.spouseName || data.spouseEmail) ? {
      firstName: (data.spouseName || '').split(' ')[0] || '',
      middleName: '',
      lastName: (data.spouseName || '').split(' ').slice(1).join(' ') || '',
      email: data.spouseEmail || '',
      phone: data.spousePhone || '',
    } : null,
    children: data.children ? (() => { try { return JSON.parse(data.children!); } catch { return []; } })() : [],
    membershipType: data.membershipType || '',
    membershipLevel: data.membershipLevel || '',
    memberStatus: data.memberStatus || '',
    payments: (() => { try { return JSON.parse(data.payments || '[]'); } catch { return []; } })(),
    sponsors: (() => { try { return JSON.parse(data.sponsors || '[]'); } catch { return []; } })(),
  });

  // Dynamic wizard steps based on registration type and event config
  const wizardSteps = useMemo<WizardStep[]>(() => {
    const steps: WizardStep[] = [];
    if (regType === 'Guest') steps.push('contact');
    if (regType === 'Member') steps.push('profile_review');
    steps.push('attendees');
    const showActivities = eventActivities.length > 0 &&
      (regType === 'Member' || guestPolicy?.allowGuestActivities !== false);
    if (showActivities) steps.push('activities');
    steps.push('review');
    return steps;
  }, [regType, eventActivities.length, guestPolicy?.allowGuestActivities]);

  // Prefill email from session but don't auto-advance — let user click Look Up
  useEffect(() => {
    if (step === 'identify' && session?.user?.email && !autoLookupDone.current) {
      autoLookupDone.current = true;
      setLookupEmail(session.user.email);
    }
  }, [step, session]);

  // Fetch fee settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/public');
        const json = await res.json();
        if (json.success && json.data?.feeSettings) {
          setFeeSettings(json.data.feeSettings);
        }
        if (json.success && json.data?.membershipSettings) {
          const types = json.data.membershipSettings.membershipTypes || [];
          setMembershipCost(types.length > 0 ? types[0].price : 0);
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
          setCategoryLogoUrl(json.data.categoryLogoUrl || '');
          setCategoryBgColor(json.data.categoryBgColor || '');
          if (json.data.pricingRules) {
            setPricingRules(parsePricingRules(json.data.pricingRules));
          }
          setFormFields(parseFormConfig(json.data.formConfig || ''));
          setEventActivities(parseActivities(json.data.activities || ''));
          setActPricingMode(parseActivityPricingMode(json.data.activityPricingMode || ''));
          setGuestPolicy(parseGuestPolicy(json.data.guestPolicy || ''));

          if (json.data.status === 'Completed' || json.data.status === 'Cancelled') {
            setErrorMsg(json.data.status === 'Cancelled' ? 'This event has been cancelled.' : 'This event has ended.');
            setStep('error');
            return;
          }

          if (json.data.date) {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const eventDate = new Date(json.data.date + 'T00:00:00');
            eventDate.setDate(eventDate.getDate() + 1);
            const cutoff = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
            if (today > cutoff) {
              setErrorMsg('This event has ended.');
              setStep('error');
              return;
            }
          }

          if (json.data.status !== 'Upcoming') {
            setErrorMsg('This event is not open for registration.');
            setStep('error');
            return;
          }
          if (json.data.registrationOpen?.toLowerCase() !== 'true') {
            setErrorMsg('Registration is currently closed for this event.');
            setStep('error');
            return;
          }
          setStep('identify');
          analytics.registrationStarted(eventId, json.data.name);
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
    const hasGuestPricing = regType === 'Guest' && pricingRules &&
      (pricingRules.guestAdultPrice > 0 || pricingRules.guestKidPrice > 0);
    const shouldCalcPrice = pricingRules && (pricingRules.enabled || hasGuestPricing);

    if (shouldCalcPrice) {
      let breakdown = calculatePrice({
        pricingRules,
        type: regType,
        adults,
        freeKids,
        paidKids,
        otherSubEventCount: 0,
      });
      const validRegs = activityRegistrations.filter((r) => r.activityId);
      if (eventActivities.length > 0 && validRegs.length > 0) {
        breakdown = calculateActivityPrice(breakdown, eventActivities, validRegs, actPricingMode);
      }
      setPriceBreakdown(breakdown);
    } else {
      setPriceBreakdown(null);
    }
  }, [pricingRules, regType, adults, freeKids, paidKids, eventActivities, activityRegistrations, actPricingMode]);

  const handleLookup = async () => {
    const emailErr = validateEmailRequired(lookupEmail);
    if (emailErr) { setFieldErrors((e) => ({ ...e, lookupEmail: emailErr })); return; }
    setFieldErrors((e) => ({ ...e, lookupEmail: null }));
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
      if (data.guestPolicy) setGuestPolicy(data.guestPolicy);

      if (data.status === 'already_checked_in') {
        setForm((f) => ({ ...f, name: data.name || '' }));
        setStep('success');
        return;
      }

      if (data.status === 'already_registered_spouse') {
        setErrorMsg(`This family is already registered under ${data.name} (${data.spouseEmail}). You don't need to register again.`);
        setStep('error');
        return;
      }

      // If already registered (not checked in), show already_registered step
      if (data.registrationData) {
        setExistingParticipantId(data.registrationData.participantId);
        setOriginalPaidAmount(
          data.registrationData.paymentStatus === 'paid'
            ? parseFloat(data.registrationData.totalPrice || '0')
            : 0,
        );
        // Pre-fill form data from lookup
        setForm((f) => ({
          ...f,
          name: data.name || f.name,
          email: data.email || lookupEmail.trim(),
          phone: data.phone || f.phone,
          city: data.city || f.city,
          referredBy: data.referredBy || f.referredBy,
        }));
        // Pre-fill attendee counts from registration
        const regAdults = data.registrationData.registeredAdults || 1;
        const regKids = data.registrationData.registeredKids || 0;
        setAdults(regAdults);
        if (pricingRules?.memberPricingModel === 'family') {
          setFreeKids(regKids);
        } else {
          // Best-effort split: put all kids in paid (user can adjust)
          setFreeKids(0);
          setPaidKids(regKids);
        }
        // Pre-fill activities
        if (data.registrationData.selectedActivities) {
          try {
            const parsed = JSON.parse(data.registrationData.selectedActivities);
            if (Array.isArray(parsed)) setActivityRegistrations(parsed);
          } catch { /* ignore parse errors */ }
        }
        // Set reg type based on member/guest status
        if (data.status === 'member_active' || data.status === 'member_expired') {
          setRegType('Member');
          setMemberProfile(buildMemberProfile(data));
        } else {
          setRegType('Guest');
        }
        setStep('already_registered');
        return;
      }

      if (data.status === 'member_active') {
        if (!session?.user?.email) {
          // Active member but not signed in — prompt to sign in
          setForm((f) => ({ ...f, name: data.name || '', email: lookupEmail.trim() }));
          setStep('sign_in_required');
          return;
        }
        setRegType('Member');
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || lookupEmail.trim(),
          phone: data.phone || '',
        }));
        setMemberProfile(buildMemberProfile(data));
        setWizardStep('profile_review');
        setStep('wizard');
        return;
      }

      if (data.status === 'member_expired') {
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || lookupEmail.trim(),
          phone: data.phone || '',
        }));
        setMemberProfile(buildMemberProfile(data));
        setStep('membership_expired');
        return;
      }

      // Guest flow — check guest policy
      if (guestPolicy && (!guestPolicy.allowGuests || guestPolicy.guestAction === 'blocked')) {
        setErrorMsg(guestPolicy.guestMessage || 'Guest registration is not available for this event.');
        setStep('error');
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
          kids: freeKids + paidKids,
          totalPrice: String((priceBreakdown?.total || 0) + (isRenewing ? membershipCost : 0)),
          priceBreakdown: priceBreakdown ? JSON.stringify(priceBreakdown) : '',
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          selectedActivities: activityRegistrations.filter((r) => r.activityId).length > 0 ? JSON.stringify(activityRegistrations.filter((r) => r.activityId)) : '',
          customFields: Object.keys(customFieldValues).length > 0 ? JSON.stringify(customFieldValues) : '',
          profileUpdate: profileChanged && memberProfile ? JSON.stringify({
            phone: memberProfile.phone,
            address: memberProfile.address,
            spouse: memberProfile.spouse,
            children: memberProfile.children,
          }) : '',
          membershipRenewal: isRenewing ? String(membershipCost) : '',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPaymentInfo(payment);
        setStep('success');
        analytics.registrationCompleted(eventId, type, priceBreakdown?.total || 0);
      } else {
        setErrorMsg(json.error || 'Registration failed.');
        setStep('error');
        analytics.registrationError(eventId, json.error || 'Registration failed.');
      }
    } catch {
      setErrorMsg('Registration failed.');
      setStep('error');
      analytics.registrationError(eventId, 'Registration failed.');
    }
  };

  const submitUpdate = async (
    payment: { paymentStatus: string; paymentMethod: string; transactionId: string },
  ) => {
    setStep('submitting');
    try {
      const res = await fetch(`/api/events/${eventId}/registrations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: existingParticipantId,
          memberId: lookupResult?.memberId || '',
          name: form.name,
          phone: form.phone,
          city: form.city,
          referredBy: form.referredBy,
          adults,
          kids: freeKids + paidKids,
          totalPrice: priceBreakdown ? String(priceBreakdown.total) : '0',
          priceBreakdown: priceBreakdown ? JSON.stringify(priceBreakdown) : '',
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          selectedActivities: activityRegistrations.filter((r) => r.activityId).length > 0 ? JSON.stringify(activityRegistrations.filter((r) => r.activityId)) : '',
          customFields: Object.keys(customFieldValues).length > 0 ? JSON.stringify(customFieldValues) : '',
          profileUpdate: profileChanged && memberProfile ? JSON.stringify({
            phone: memberProfile.phone,
            address: memberProfile.address,
            spouse: memberProfile.spouse,
            children: memberProfile.children,
          }) : '',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPaymentInfo(payment);
        setStep('success');
      } else {
        setErrorMsg(json.error || 'Update failed.');
        setStep('error');
      }
    } catch {
      setErrorMsg('Update failed.');
      setStep('error');
    }
  };

  const validateContactStep = (): boolean => {
    const errors: Record<string, string | null> = {};
    errors.name = validateNameRequired(form.name);
    errors.email = validateEmailRequired(form.email);
    errors.phone = validatePhone(form.phone);
    errors.city = form.city.trim() ? null : 'City is required';
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return !errors.name && !errors.email && !errors.phone && !errors.city;
  };

  const validateActivitiesStep = (): boolean => {
    if (noParticipation) {
      setFieldErrors((prev) => ({ ...prev, activities: null }));
      return true;
    }
    const validRegs = activityRegistrations.filter((r) => r.activityId);
    if (validRegs.length === 0) {
      setFieldErrors((prev) => ({ ...prev, activities: 'Please select at least one activity or check "No participation"' }));
      return false;
    }
    const missingName = validRegs.some((r) => !r.participantName.trim());
    if (missingName) {
      setFieldErrors((prev) => ({ ...prev, activities: 'Participant name is required for each activity' }));
      return false;
    }
    setFieldErrors((prev) => ({ ...prev, activities: null }));
    return true;
  };

  const validateCurrentWizardStep = (): boolean => {
    if (wizardStep === 'contact') return validateContactStep();
    if (wizardStep === 'activities') return validateActivitiesStep();
    return true;
  };

  // Track wizard step views
  useEffect(() => {
    if (step === 'wizard') {
      analytics.registrationStepViewed(wizardStep, eventId);
    }
  }, [wizardStep, step, eventId]);

  const handleWizardNext = () => {
    if (!validateCurrentWizardStep()) return;
    const currentIdx = wizardSteps.indexOf(wizardStep);
    if (currentIdx < wizardSteps.length - 1) {
      setWizardStep(wizardSteps[currentIdx + 1]);
    }
  };

  const handleWizardBack = () => {
    const currentIdx = wizardSteps.indexOf(wizardStep);
    if (currentIdx > 0) {
      setWizardStep(wizardSteps[currentIdx - 1]);
    }
  };

  const handleRegister = async (type: 'Member' | 'Guest') => {
    // Validate contact fields for guests
    if (type === 'Guest') {
      if (!validateContactStep()) return;
    }
    // Validate activities if applicable
    if (eventActivities.length > 0) {
      if (!validateActivitiesStep()) return;
    }
    const eventTotal = priceBreakdown?.total || 0;
    const renewalAmount = isRenewing ? membershipCost : 0;
    const total = eventTotal + renewalAmount;

    if (isModifying) {
      // Calculate additional amount owed (no refund)
      const additionalAmount = Math.max(0, total - originalPaidAmount);
      if (PAYMENTS_ENABLED && additionalAmount > 0) {
        setPendingRegType(type);
        setStep('payment');
        return;
      }
      // No additional payment needed — submit update directly
      await submitUpdate({ paymentStatus: '', paymentMethod: '', transactionId: '' });
      return;
    }

    if (PAYMENTS_ENABLED && total > 0) {
      setPendingRegType(type);
      setStep('payment');
      return;
    }
    await submitRegistration(type, { paymentStatus: '', paymentMethod: '', transactionId: '' });
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
            <label className="label">Kids age {kidFreeAge + 1}&ndash;{kidMaxAge}</label>
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
          Flat family price &mdash; ${pricingRules.memberFamilyPrice}
        </p>
      )}
    </div>
  );

  const currentWizardIdx = wizardSteps.indexOf(wizardStep);
  const isFirstWizardStep = currentWizardIdx === 0;
  const isLastWizardStep = wizardStep === 'review';

  const ProgressIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {wizardSteps.map((ws, idx) => {
        const isCompleted = idx < currentWizardIdx;
        const isActive = idx === currentWizardIdx;
        return (
          <div key={ws} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isCompleted
                    ? 'text-white'
                    : isActive
                      ? 'border-2'
                      : 'border-2 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                }`}
                style={
                  isCompleted
                    ? { backgroundColor: 'var(--btn-color, #2563eb)' }
                    : isActive
                      ? { borderColor: 'var(--btn-color, #2563eb)', color: 'var(--btn-color, #2563eb)' }
                      : undefined
                }
              >
                {isCompleted ? <HiCheck className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-[10px] mt-1 ${
                  isCompleted || isActive
                    ? 'font-medium'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                style={
                  isCompleted || isActive
                    ? { color: 'var(--btn-color, #2563eb)' }
                    : undefined
                }
              >
                {WIZARD_LABELS[ws]}
              </span>
            </div>
            {idx < wizardSteps.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 mb-4 ${
                  idx < currentWizardIdx
                    ? ''
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={
                  idx < currentWizardIdx
                    ? { backgroundColor: 'var(--btn-color, #2563eb)' }
                    : undefined
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const ReviewSummary = () => {
    const validActivities = activityRegistrations.filter((r) => r.activityId);
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registration Summary</h3>
          {regType === 'Guest' && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Name</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{form.name}</span>
              </div>
              {form.email && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Email</span>
                  <span className="text-gray-900 dark:text-gray-100">{form.email}</span>
                </div>
              )}
            </div>
          )}
          {regType === 'Member' && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Member</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{form.name}</span>
              </div>
            </div>
          )}
          <div className="space-y-1 text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Adults</span>
              <span className="text-gray-900 dark:text-gray-100">{adults}</span>
            </div>
            {(freeKids > 0 || paidKids > 0) && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kids</span>
                <span className="text-gray-900 dark:text-gray-100">{freeKids + paidKids}</span>
              </div>
            )}
          </div>
          {eventActivities.length > 0 && (
            <div className="space-y-1 text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
              <span className="text-gray-500 dark:text-gray-400">Activities</span>
              {noParticipation ? (
                <div className="pl-2">
                  <span className="text-gray-500 dark:text-gray-400 italic">No participation</span>
                </div>
              ) : (
                validActivities.map((r, i) => {
                  const act = eventActivities.find((a) => a.id === r.activityId);
                  return (
                    <div key={i} className="flex justify-between pl-2">
                      <span className="text-gray-700 dark:text-gray-300">{act?.name || r.activityId}</span>
                      <span className="text-gray-900 dark:text-gray-100">{r.participantName || '—'}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {Object.keys(customFieldValues).length > 0 && (
            <div className="space-y-1 text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
              {formFields.map((field) => {
                const val = customFieldValues[field.id];
                if (!val) return null;
                return (
                  <div key={field.id} className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{field.label}</span>
                    <span className="text-gray-900 dark:text-gray-100">{val}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {isRenewing && membershipCost > 0 && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">Membership Renewal</h3>
            <div className="flex justify-between text-sm">
              <span className="text-purple-600 dark:text-purple-400">Yearly Membership</span>
              <span className="text-purple-700 dark:text-purple-300 font-medium">${membershipCost.toFixed(2)}</span>
            </div>
          </div>
        )}
        {priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
        {isRenewing && membershipCost > 0 && priceBreakdown && priceBreakdown.total > 0 && (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-900 dark:text-gray-100">Grand Total</span>
              <span className="text-gray-900 dark:text-gray-100">${(membershipCost + priceBreakdown.total).toFixed(2)}</span>
            </div>
          </div>
        )}
        {isModifying && priceBreakdown && originalPaidAmount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-amber-700 dark:text-amber-400">Previously Paid</span>
              <span className="text-amber-700 dark:text-amber-400">${originalPaidAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-amber-800 dark:text-amber-300">
                {priceBreakdown.total > originalPaidAmount ? 'Additional Amount Due' : 'No Additional Charge'}
              </span>
              <span className="text-amber-800 dark:text-amber-300">
                ${Math.max(0, priceBreakdown.total - originalPaidAmount).toFixed(2)}
              </span>
            </div>
            {priceBreakdown.total < originalPaidAmount && (
              <p className="text-xs text-amber-600 dark:text-amber-500">No refunds for reduced attendance.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PublicLayout eventName={eventName} logoUrl={categoryLogoUrl} bgColor={categoryBgColor} homeUrl={`/events/${eventId}/home`}>
      {(step === 'loading' || sessionStatus === 'loading') && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {step === 'error' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          {errorMsg !== 'This event has ended.' && errorMsg !== 'This event is not open for registration.' && errorMsg !== 'Registration is currently closed for this event.' && errorMsg !== 'Event not found.' && (
            <button onClick={() => { setErrorMsg(''); setStep('identify'); }} className="mt-4 btn-secondary">
              Try Again
            </button>
          )}
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
                onChange={(e) => { setLookupEmail(e.target.value); setFieldErrors((fe) => ({ ...fe, lookupEmail: null })); }}
                onBlur={() => { if (lookupEmail.trim()) setFieldErrors((fe) => ({ ...fe, lookupEmail: validateEmailRequired(lookupEmail) })); }}
                className={`input ${fieldErrors.lookupEmail ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <FieldError error={fieldErrors.lookupEmail} />
            </div>
            <button onClick={handleLookup} disabled={!lookupEmail.trim() || !!fieldErrors.lookupEmail} className="btn-primary w-full">
              Look Up
            </button>
          </div>
        </div>
      )}

      {step === 'sign_in_required' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Welcome, {form.name}!
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            As an active member, please sign in to continue with your full profile and member benefits.
          </p>
          <button
            onClick={() => router.push(`/auth/signin?callbackUrl=/events/${eventId}/register`)}
            className="btn-primary w-full"
          >
            Sign In
          </button>
        </div>
      )}

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
              href="https://www.meant.org/join-meant.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full inline-block text-center"
            >
              Become a Member
            </a>
            {guestPolicy?.guestAction !== 'become_member' && (
              <button
                onClick={() => { setWizardStep('contact'); setStep('wizard'); }}
                className="btn-secondary w-full"
              >
                Continue as Guest
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'membership_expired' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Membership Expired
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Hi {form.name}, your membership status is <span className="font-medium text-amber-600 dark:text-amber-400">{lookupResult?.memberStatus || 'Expired'}</span>.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Would you like to renew your membership{membershipCost > 0 ? ` ($${membershipCost.toFixed(2)}/year)` : ''}, or continue registering as a guest?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setIsRenewing(true);
                setRegType('Member');
                setWizardStep('profile_review');
                setStep('wizard');
              }}
              className="btn-primary w-full"
            >
              Renew Membership{membershipCost > 0 ? ` ($${membershipCost.toFixed(2)})` : ''}
            </button>
            <button
              onClick={() => {
                setIsRenewing(false);
                setRegType('Guest');
                setMemberProfile(null);
                setProfileChanged(false);
                setWizardStep('contact');
                setStep('wizard');
              }}
              className="btn-secondary w-full"
            >
              Continue as Guest
            </button>
          </div>
        </div>
      )}

      {step === 'already_registered' && lookupResult?.registrationData && (
        <div className="card p-6">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">Already Registered</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
            This email is already registered for this event. You can update your registration below.
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Name</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{form.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Adults</span>
              <span className="text-gray-900 dark:text-gray-100">{lookupResult.registrationData.registeredAdults}</span>
            </div>
            {lookupResult.registrationData.registeredKids > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kids</span>
                <span className="text-gray-900 dark:text-gray-100">{lookupResult.registrationData.registeredKids}</span>
              </div>
            )}
            {lookupResult.registrationData.totalPrice !== '0' && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Paid</span>
                <span className="text-gray-900 dark:text-gray-100">
                  ${parseFloat(lookupResult.registrationData.totalPrice).toFixed(2)}
                  {lookupResult.registrationData.paymentStatus === 'paid' && (
                    <span className="text-green-600 dark:text-green-400 ml-1">(Paid)</span>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <button
              onClick={() => {
                setIsModifying(true);
                setWizardStep(regType === 'Guest' ? 'contact' : 'profile_review');
                setStep('wizard');
              }}
              className="btn-primary w-full"
            >
              Update Registration
            </button>
            <button
              onClick={() => setStep('success')}
              className="btn-secondary w-full"
            >
              Keep Current Registration
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
            Note: No refunds for reduced attendance. Additional charges apply for extra attendees.
          </p>
        </div>
      )}

      {step === 'wizard' && (
        <div className="card p-6">
          <ProgressIndicator />

          {/* Member welcome header on first wizard step */}
          {regType === 'Member' && isFirstWizardStep && lookupResult && (
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Welcome, {form.name}!</h2>
              <StatusBadge status={lookupResult.status === 'member_active' ? 'Active' : (lookupResult.memberStatus || 'Member')} />
            </div>
          )}

          {/* Step: Contact (guest only) */}
          {wizardStep === 'contact' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Contact Details</h3>
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((fe) => ({ ...fe, name: null })); }}
                  onBlur={() => setFieldErrors((fe) => ({ ...fe, name: validateNameRequired(form.name) }))}
                  className={`input ${fieldErrors.name ? 'border-red-500 dark:border-red-500' : ''}`}
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
                />
                <FieldError error={fieldErrors.email} />
              </div>
              <div>
                <label className="label">Phone *</label>
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
                <label className="label">City *</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => { setForm({ ...form, city: e.target.value }); setFieldErrors((fe) => ({ ...fe, city: null })); }}
                  onBlur={() => setFieldErrors((fe) => ({ ...fe, city: form.city.trim() ? null : 'City is required' }))}
                  className={`input ${fieldErrors.city ? 'border-red-500 dark:border-red-500' : ''}`}
                />
                <FieldError error={fieldErrors.city} />
              </div>
              <div>
                <label className="label">Referred By</label>
                <input type="text" value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })} className="input" />
              </div>
            </div>
          )}

          {/* Step: Profile Review (member only) */}
          {wizardStep === 'profile_review' && memberProfile && (
            <ProfileReviewStep
              profile={memberProfile}
              memberName={form.name}
              onChange={(updated) => {
                setMemberProfile(updated);
                setProfileChanged(true);
                setForm((f) => ({ ...f, phone: updated.phone }));
              }}
            />
          )}

          {/* Step: Attendees */}
          {wizardStep === 'attendees' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Attendees</h3>
              <AdultsKidsInputs />
            </div>
          )}

          {/* Step: Activities */}
          {wizardStep === 'activities' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={noParticipation}
                  onChange={(e) => {
                    setNoParticipation(e.target.checked);
                    if (e.target.checked) {
                      setActivityRegistrations([]);
                      setFieldErrors((prev) => ({ ...prev, activities: null }));
                    }
                  }}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">No participation in activities</span>
              </label>
              {!noParticipation && (
                <ActivitySelector
                  activities={eventActivities}
                  registrations={activityRegistrations}
                  activityPricingMode={actPricingMode}
                  onChange={setActivityRegistrations}
                />
              )}
              <FieldError error={fieldErrors.activities} />
            </div>
          )}

          {/* Step: Review */}
          {wizardStep === 'review' && (
            <div className="space-y-3">
              <ReviewSummary />
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {!isFirstWizardStep && (
              <button onClick={handleWizardBack} className="btn-secondary flex-1">
                Back
              </button>
            )}
            {isLastWizardStep ? (
              <button onClick={() => handleRegister(regType)} className="btn-primary flex-1">
                {isModifying ? 'Update Registration' : 'Register'}
              </button>
            ) : (
              <button onClick={handleWizardNext} className="btn-primary flex-1">
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'payment' && (priceBreakdown || (isRenewing && membershipCost > 0)) && (
        <PaymentForm
          amount={(() => {
            const eventTotal = priceBreakdown?.total || 0;
            const renewalAmount = isRenewing ? membershipCost : 0;
            const combined = eventTotal + renewalAmount;
            return isModifying ? Math.max(0, combined - originalPaidAmount) : combined;
          })()}
          eventId={eventId}
          eventName={eventName}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={(result) => {
            const payment = {
              paymentStatus: 'paid',
              paymentMethod: result.method,
              transactionId: result.transactionId,
            };
            if (isModifying) {
              submitUpdate(payment);
            } else {
              submitRegistration(pendingRegType, payment);
            }
          }}
          onCancel={() => {
            const noPayment = { paymentStatus: '', paymentMethod: '', transactionId: '' };
            if (isModifying) {
              submitUpdate(noPayment);
            } else {
              submitRegistration(pendingRegType, noPayment);
            }
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
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{isModifying ? 'Updating...' : 'Registering...'}</p>
        </div>
      )}

      {step === 'success' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isModifying ? 'Registration Updated!' : 'Registration Successful!'}
          </h2>
          {isRenewing && (
            <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mt-1">Membership renewed!</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{form.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{eventName}</p>
          {paymentInfo.transactionId && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
              Payment confirmed ({paymentInfo.paymentMethod}) &mdash; {paymentInfo.transactionId}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {new Date().toLocaleString()}
          </p>
          <button
            onClick={() => router.push(`/events/${eventId}/home`)}
            className="mt-4 btn-primary inline-flex items-center"
          >
            Go Back Home
          </button>
        </div>
      )}
    </PublicLayout>
  );
}
