'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PublicLayout from '@/components/events/PublicLayout';
import PriceDisplay from '@/components/events/PriceDisplay';
import PaymentForm from '@/components/events/PaymentForm';
import ActivitySelector from '@/components/events/ActivitySelector';
import StatusBadge from '@/components/ui/StatusBadge';
import ProfileReviewStep from '@/components/events/ProfileReviewStep';
import OTPStep from '@/components/events/OTPStep';
import SignInRequiredStep from '@/components/events/SignInRequiredStep';
import { loadMyProfile, sendCheckinOTP } from '@/lib/event-registration-api';
import { parseLocalDate } from '@/lib/utils';
import { shouldHideGuestOption } from '@/types/event-registration';
import type { OTPVerifiedProfile } from '@/types/event-registration';
import { parsePricingRules, calculatePrice, calculateActivityPrice } from '@/lib/pricing';
import { parseFormConfig, parseActivities, parseActivityPricingMode, parseGuestPolicy } from '@/lib/event-config';
import { getEventTheme } from '@/lib/event-theme';
import { validateEmail, validateEmailRequired, validatePhone, validateNameRequired } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import type { PricingRules, PriceBreakdown, FeeSettings, FormFieldConfig, ActivityConfig, ActivityPricingMode, GuestPolicy, ActivityRegistration, MembershipTypeConfig } from '@/types';
import { HiOutlineCheckCircle, HiOutlineHeart, HiOutlineExclamationTriangle, HiCheck, HiOutlineClock, HiXMark } from 'react-icons/hi2';
import { analytics } from '@/lib/analytics';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

type Step = 'loading' | 'splash' | 'identify' | 'sign_in_required' | 'otp_verify' | 'membership_offer' | 'membership_expired' | 'renewal_options' | 'renewal_payment' | 'renewal_success' | 'already_registered' | 'guest_blocked' | 'pending_application' | 'wizard' | 'payment' | 'submitting' | 'success' | 'error';
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
  attendeeNames: string;
  totalPrice: string;
  paymentStatus: string;
  registrationStatus: string;
}

// LookupResult covers both the full PII result (when authenticated) and the
// OTPVerifiedProfile (after OTP verification). Kept as a local interface for
// backward compatibility with the existing state machine.
interface LookupResult {
  status: string;
  message?: string;
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
  spouseNativePlace?: string;
  spouseCompany?: string;
  spouseCollege?: string;
  spouseQualifyingDegree?: string;
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
  profileComplete?: boolean;
  missingFields?: string[];
}

export interface RegisterEventData {
  id: string;
  name: string;
  description: string;
  date: string;
  status: string;
  categoryLogoUrl: string;
  categoryBgColor: string;
  pricingRules: string;
  formConfig: string;
  activities: string;
  activityPricingMode: string;
  guestPolicy: string;
  registrationOpen: string;
  capacity: number;
  capacityMode: string;
  spotsRemaining: number;
  waitlistCount: number;
}

export interface RegisterClientProps {
  eventData: RegisterEventData;
  feeSettings: FeeSettings | null;
  membershipTypes: MembershipTypeConfig[];
}

export default function RegisterClient({ eventData, feeSettings: serverFeeSettings, membershipTypes: serverMembershipTypes }: RegisterClientProps) {
  const eventId = eventData.id;
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
  const [adults, setAdults] = useState(0);
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
  const [membershipTypes, setMembershipTypes] = useState<MembershipTypeConfig[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<MembershipTypeConfig | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewalOnly, setRenewalOnly] = useState(false);
  const [renewalPaymentInfo, setRenewalPaymentInfo] = useState<{
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
  }>({ paymentStatus: '', paymentMethod: '', transactionId: '' });
  const [registrationStatus, setRegistrationStatus] = useState<'confirmed' | 'waitlist'>('confirmed');
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [attendeeAges, setAttendeeAges] = useState<string[]>([]);
  const [emailConsent, setEmailConsent] = useState(true);
  const [mediaConsent, setMediaConsent] = useState(true);

  // OTP verification state (for unauthenticated guest flows)
  const [otpVerifiedToken, setOtpVerifiedToken] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState('');

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
      nativePlace: data.spouseNativePlace || '',
      company: data.spouseCompany || '',
      college: data.spouseCollege || '',
      qualifyingDegree: data.spouseQualifyingDegree || '',
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

  // Initialize from server-fetched props
  useEffect(() => {
    setFeeSettings(serverFeeSettings);
    setMembershipTypes(serverMembershipTypes);

    setEventName(eventData.name);
    setCategoryLogoUrl(eventData.categoryLogoUrl || '');
    setCategoryBgColor(eventData.categoryBgColor || '');
    if (eventData.pricingRules) {
      setPricingRules(parsePricingRules(eventData.pricingRules));
    }
    setFormFields(parseFormConfig(eventData.formConfig || ''));
    setEventActivities(parseActivities(eventData.activities || ''));
    setActPricingMode(parseActivityPricingMode(eventData.activityPricingMode || ''));
    setGuestPolicy(parseGuestPolicy(eventData.guestPolicy || ''));

    if (eventData.status === 'Completed' || eventData.status === 'Cancelled') {
      setErrorMsg(eventData.status === 'Cancelled' ? 'This event has been cancelled.' : 'This event has ended.');
      setStep('error');
      return;
    }

    if (eventData.date) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      const eventDateParts = eventData.date.split('-').map(Number);
      const eventDateObj = new Date(eventDateParts[0], eventDateParts[1] - 1, eventDateParts[2] + 1);
      const cutoff = `${eventDateObj.getFullYear()}-${String(eventDateObj.getMonth() + 1).padStart(2, '0')}-${String(eventDateObj.getDate()).padStart(2, '0')}`;
      if (today > cutoff) {
        setErrorMsg('This event has ended.');
        setStep('error');
        return;
      }
    }

    if (eventData.status !== 'Upcoming') {
      setErrorMsg('This event is not open for registration.');
      setStep('error');
      return;
    }
    if (eventData.registrationOpen?.toLowerCase() !== 'true') {
      setErrorMsg('Registration is currently closed for this event.');
      setStep('error');
      return;
    }
    setStep('splash');
    analytics.registrationStarted(eventId, eventData.name);
  }, []);

  // Auto-advance splash screen after 3 seconds.
  // If a session exists, attempt to auto-load their profile instead of going to identify.
  useEffect(() => {
    if (step !== 'splash') return;
    const timer = setTimeout(async () => {
      if (session?.user?.email) {
        try {
          const profile = await loadMyProfile(eventId);
          applyLookupResult(profile as unknown as LookupResult, session.user!.email!, true);
          return;
        } catch {
          // Profile load failed — fall through to identify step
        }
      }
      setStep('identify');
    }, 3000);
    return () => clearTimeout(timer);
  }, [step, session]);

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
        breakdown = calculateActivityPrice(breakdown, eventActivities, validRegs, actPricingMode, pricingRules);
      }
      setPriceBreakdown(breakdown);
    } else {
      setPriceBreakdown(null);
    }
  }, [pricingRules, regType, adults, freeKids, paidKids, eventActivities, activityRegistrations, actPricingMode]);

  /**
   * Core routing logic after we have a lookup result.
   * Called from both handleLookup (manual lookup) and the auto-load path (session).
   * When hasSession=true the data may contain full PII; when false it is PublicLookupResult.
   */
  const applyLookupResult = (data: LookupResult, emailUsed: string, hasSession = false) => {
    setLookupResult(data);
    if (data.guestPolicy) setGuestPolicy(data.guestPolicy);

    if (data.status === 'already_checked_in') {
      setForm((f) => ({ ...f, name: data.name || '' }));
      setStep('success');
      return;
    }

    if (data.status === 'already_registered_spouse') {
      setErrorMsg(`This family is already registered. You don't need to register again.`);
      setStep('error');
      return;
    }

    // If already registered (not checked in) and we have PII — show already_registered
    if (data.registrationData && (hasSession || data.name)) {
      setExistingParticipantId(data.registrationData.participantId);
      setOriginalPaidAmount(
        data.registrationData.paymentStatus === 'paid'
          ? parseFloat(data.registrationData.totalPrice || '0')
          : 0,
      );
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        email: data.email || emailUsed,
        phone: data.phone || f.phone,
        city: data.city || f.city,
        referredBy: data.referredBy || f.referredBy,
      }));
      const regAdults = data.registrationData.registeredAdults ?? 0;
      const regKids = data.registrationData.registeredKids || 0;
      setAdults(regAdults);
      if (pricingRules?.memberPricingModel === 'family') {
        setFreeKids(regKids);
      } else {
        setFreeKids(0);
        setPaidKids(regKids);
      }
      if (data.registrationData.attendeeNames) {
        try {
          const parsed = JSON.parse(data.registrationData.attendeeNames);
          if (Array.isArray(parsed)) {
            const names: string[] = [];
            const ages: string[] = [];
            for (const entry of parsed) {
              const ageMatch = String(entry).match(/^(.+?)\s*\(age\s*(\d+)\)$/);
              if (ageMatch) {
                names.push(ageMatch[1]);
                ages.push(ageMatch[2]);
              } else {
                names.push(String(entry));
                ages.push('');
              }
            }
            setAttendeeNames(names);
            setAttendeeAges(ages);
          }
        } catch { /* ignore parse errors */ }
      }
      if (data.registrationData.selectedActivities) {
        try {
          const parsed = JSON.parse(data.registrationData.selectedActivities);
          if (Array.isArray(parsed)) setActivityRegistrations(parsed);
        } catch { /* ignore parse errors */ }
      }
      if (data.status === 'member_active' || data.status === 'member_expired') {
        setRegType('Member');
        if (data.name) setMemberProfile(buildMemberProfile(data));
      } else {
        setRegType('Guest');
      }
      setStep('already_registered');
      return;
    }

    // Member found — require sign-in (no PII exposed when unauthenticated)
    if (data.status === 'member_active' || data.status === 'member_expired') {
      if (!hasSession) {
        // Show sign-in required screen — API only returned first name, no PII
        setOtpEmail(emailUsed);
        setForm((f) => ({ ...f, email: emailUsed }));
        setStep('sign_in_required');
        return;
      }
      // Has session — full PII available
      setRegType('Member');
      setForm((f) => ({
        ...f,
        name: data.name || '',
        email: data.email || emailUsed,
        phone: data.phone || '',
      }));
      setMemberProfile(buildMemberProfile(data));
      if (data.status === 'member_active') {
        setWizardStep('profile_review');
        setStep('wizard');
      } else {
        setStep('membership_expired');
      }
      return;
    }

    // Guest policy block check
    const effectivePolicy = data.guestPolicy || guestPolicy;
    if (data.status !== 'pending_application' && effectivePolicy && (!effectivePolicy.allowGuests || effectivePolicy.guestAction === 'blocked')) {
      setErrorMsg(effectivePolicy.guestMessage || 'Guest registration is not available for this event.');
      setStep('guest_blocked');
      return;
    }

    if (data.status === 'pending_application') {
      setForm((f) => ({ ...f, email: emailUsed }));
      setStep('pending_application');
      return;
    }

    // Guest / not_found — require OTP verification if not already done
    if (!hasSession && !otpVerifiedToken) {
      // Send OTP and go to verify step
      setOtpEmail(emailUsed);
      setForm((f) => ({ ...f, email: emailUsed }));
      sendCheckinOTP(eventId, emailUsed).catch(() => {/* ignore send error; user can resend */});
      setStep('otp_verify');
      return;
    }

    // OTP verified or authenticated — proceed to guest registration
    if (data.status === 'returning_guest') {
      setRegType('Guest');
      setForm({
        name: data.name || '',
        email: data.email || emailUsed,
        phone: data.phone || '',
        city: data.city || '',
        referredBy: data.referredBy || '',
      });
    } else {
      setRegType('Guest');
      setForm((f) => ({ ...f, email: emailUsed }));
    }
    setStep('membership_offer');
  };

  const handleLookup = async () => {
    const input = lookupEmail.trim();
    const emailErr = validateEmailRequired(input);
    if (emailErr) { setFieldErrors((e) => ({ ...e, lookupEmail: emailErr })); return; }
    setFieldErrors((e) => ({ ...e, lookupEmail: null }));

    try {
      const res = await fetch(`/api/events/${eventId}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input }),
      });
      const json = await res.json();
      if (!json.success) { setErrorMsg(json.error); setStep('error'); return; }

      const hasSession = !!session?.user?.email;
      applyLookupResult(json.data as LookupResult, input, hasSession);
    } catch {
      setErrorMsg('Lookup failed.');
      setStep('error');
    }
  };

  const handleOTPVerified = (profile: OTPVerifiedProfile, code: string) => {
    // Store the actual OTP code so it can be passed with the registration payload
    setOtpVerifiedToken(code);
    const data = profile as unknown as LookupResult;
    setLookupResult(data);
    if (data.guestPolicy) setGuestPolicy(data.guestPolicy);

    const effectivePolicy = data.guestPolicy || guestPolicy;
    if (effectivePolicy && (!effectivePolicy.allowGuests || effectivePolicy.guestAction === 'blocked')) {
      setErrorMsg(effectivePolicy.guestMessage || 'Guest registration is not available for this event.');
      setStep('guest_blocked');
      return;
    }

    if (profile.status === 'returning_guest') {
      setRegType('Guest');
      setForm({
        name: profile.name || '',
        email: profile.email,
        phone: profile.phone || '',
        city: profile.city || '',
        referredBy: profile.referredBy || '',
      });
    } else {
      setRegType('Guest');
      setForm((f) => ({ ...f, email: profile.email }));
    }
    setStep('membership_offer');
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
          adults: showAdults ? adults : 0,
          kids: showKids ? freeKids + paidKids : 0,
          totalPrice: String(priceBreakdown?.total || 0),
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
          membershipRenewal: '',
          attendeeNames: attendeeNames.filter(Boolean).length > 0
            ? JSON.stringify(attendeeNames.map((name, i) => {
              const isKidEntry = isPerAdult && isPerKid ? i >= adults : isPerKid;
              return isKidEntry && attendeeAges[i] ? `${name} (age ${attendeeAges[i]})` : name;
            }).filter(Boolean))
            : '',
          emailConsent: String(emailConsent),
          mediaConsent: String(mediaConsent),
          ...(type === 'Guest' && otpVerifiedToken ? { otpToken: otpVerifiedToken } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPaymentInfo(payment);
        if (json.data?.registrationStatus === 'waitlist') {
          setRegistrationStatus('waitlist');
        }
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
          adults: showAdults ? adults : 0,
          kids: showKids ? freeKids + paidKids : 0,
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
          attendeeNames: attendeeNames.filter(Boolean).length > 0
            ? JSON.stringify(attendeeNames.map((name, i) => {
              const isKidEntry = isPerAdult && isPerKid ? i >= adults : isPerKid;
              return isKidEntry && attendeeAges[i] ? `${name} (age ${attendeeAges[i]})` : name;
            }).filter(Boolean))
            : '',
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

  const validateAttendeesStep = (): boolean => {
    if (willBeWaitlisted) {
      // Allow waitlist registration but show warning
      return true;
    }
    if (isPerAdult && !isPerKid && adults <= 0) return false;
    if (isPerKid && !isPerAdult && (freeKids + paidKids) <= 0) return false;
    if (isPerAdult && isPerKid && adults <= 0 && (freeKids + paidKids) <= 0) return false;
    // Names are required for per-person modes
    if (isPerAdult) {
      for (let i = 0; i < adults; i++) {
        if (!attendeeNames[i]?.trim()) {
          setFieldErrors((prev) => ({ ...prev, attendeeNames: `Please enter a name for Adult ${i + 1}` }));
          return false;
        }
      }
    }
    if (isPerKid) {
      const kidCount = freeKids + paidKids;
      const kidOffset = isPerAdult ? adults : 0;
      for (let i = 0; i < kidCount; i++) {
        if (!attendeeNames[kidOffset + i]?.trim()) {
          setFieldErrors((prev) => ({ ...prev, attendeeNames: `Please enter a name for Kid ${i + 1}` }));
          return false;
        }
        if (!attendeeAges[kidOffset + i]?.trim()) {
          setFieldErrors((prev) => ({ ...prev, attendeeNames: `Please enter an age for Kid ${i + 1}` }));
          return false;
        }
      }
    }
    setFieldErrors((prev) => ({ ...prev, attendeeNames: null }));
    // Validate required custom fields
    for (const field of formFields) {
      if (field.type === 'label') continue;
      if (field.required && !customFieldValues[field.id]?.trim()) {
        setFieldErrors((prev) => ({ ...prev, customFields: `${field.label} is required` }));
        return false;
      }
    }
    setFieldErrors((prev) => ({ ...prev, customFields: null }));
    return true;
  };

  const validateCurrentWizardStep = (): boolean => {
    if (wizardStep === 'contact') return validateContactStep();
    if (wizardStep === 'attendees') return validateAttendeesStep();
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

    if (isModifying) {
      // Calculate additional amount owed (no refund)
      const additionalAmount = Math.max(0, eventTotal - originalPaidAmount);
      if (PAYMENTS_ENABLED && additionalAmount > 0) {
        setPendingRegType(type);
        setStep('payment');
        return;
      }
      // No additional payment needed — submit update directly
      await submitUpdate({ paymentStatus: '', paymentMethod: '', transactionId: '' });
      return;
    }

    if (PAYMENTS_ENABLED && eventTotal > 0) {
      setPendingRegType(type);
      setStep('payment');
      return;
    }
    await submitRegistration(type, { paymentStatus: '', paymentMethod: '', transactionId: '' });
  };

  const isFamilyMember = regType === 'Member' && pricingRules?.memberPricingModel === 'family';
  const kidFreeAge = regType === 'Member' ? (pricingRules?.memberKidFreeUnderAge ?? 5) : (pricingRules?.guestKidFreeUnderAge ?? 5);
  const kidMaxAge = regType === 'Member' ? (pricingRules?.memberKidMaxAge ?? 17) : (pricingRules?.guestKidMaxAge ?? 17);

  const capMode = eventData.capacityMode || 'per_registration';
  const capModes = capMode.split(',').map((m: string) => m.trim());
  const isPerAdult = capModes.includes('per_adult');
  const isPerKid = capModes.includes('per_kid');
  const showAdults = !isPerKid || isPerAdult;
  const showKids = !isPerAdult || isPerKid;
  const spotsRemaining = eventData.spotsRemaining;
  const hasCapacityLimit = spotsRemaining >= 0;
  const requestedUnits = (isPerAdult && isPerKid) ? adults + freeKids + paidKids : isPerAdult ? adults : isPerKid ? (freeKids + paidKids) : 1;
  const exceedsCapacity = hasCapacityLimit && (isPerAdult || isPerKid) && requestedUnits > spotsRemaining;
  const willBeWaitlisted = exceedsCapacity;

  const hasFamilyData = regType === 'Member' && memberProfile !== null &&
    (memberProfile.spouse !== null || memberProfile.children.length > 0);

  const prefillFamilyDetails = () => {
    if (!memberProfile) return;

    const familyAdults: string[] = [form.name];
    if (memberProfile.spouse) {
      const sp = memberProfile.spouse;
      const spouseName = [sp.firstName, sp.middleName, sp.lastName].filter(Boolean).join(' ').trim();
      if (spouseName) familyAdults.push(spouseName);
    }

    const familyKids = memberProfile.children.filter(c => c.name);

    if (isPerAdult) setAdults(familyAdults.length);
    if (isPerKid) {
      if (isFamilyMember) {
        setFreeKids(familyKids.length);
        setPaidKids(0);
      } else {
        const freeCount = familyKids.filter(k => parseInt(k.age || '99') <= kidFreeAge).length;
        setFreeKids(freeCount);
        setPaidKids(familyKids.length - freeCount);
      }
    }

    const newNames: string[] = [];
    const newAges: string[] = [];
    if (isPerAdult) {
      for (const name of familyAdults) { newNames.push(name); newAges.push(''); }
    }
    if (isPerKid) {
      for (const kid of familyKids) { newNames.push(kid.name || ''); newAges.push(kid.age || ''); }
    }

    setAttendeeNames(newNames);
    setAttendeeAges(newAges);
    setFieldErrors(prev => ({ ...prev, attendeeNames: null }));
  };

  const removeAdult = (i: number) => {
    const newNames = [...attendeeNames];
    const newAges = [...attendeeAges];
    newNames.splice(i, 1);
    newAges.splice(i, 1);
    setAttendeeNames(newNames);
    setAttendeeAges(newAges);
    setAdults(a => Math.max(0, a - 1));
  };

  const removeKid = (kidIdx: number) => {
    const arrayIdx = (isPerAdult ? adults : 0) + kidIdx;
    const newNames = [...attendeeNames];
    const newAges = [...attendeeAges];
    newNames.splice(arrayIdx, 1);
    newAges.splice(arrayIdx, 1);
    setAttendeeNames(newNames);
    setAttendeeAges(newAges);
    if (freeKids > 0) setFreeKids(f => Math.max(0, f - 1));
    else setPaidKids(p => Math.max(0, p - 1));
  };

  const AdultsKidsInputs = () => (
    <div className="space-y-3">
      {willBeWaitlisted && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 font-medium">
          Event is at capacity. You will be added to the waitlist and notified if a spot becomes available.
        </p>
      )}
      {isPerKid && !isPerAdult && (
        <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
          This is a kids-only event. Please enter the number of kids attending.
        </p>
      )}
      {isPerAdult && !isPerKid && (
        <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
          Please enter the number of adults attending.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {showAdults && (
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
        )}
        {showKids && (
          isFamilyMember ? (
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
          )
        )}
      </div>
      {showKids && !isFamilyMember && (
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
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${isCompleted
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
                className={`text-[10px] mt-1 ${isCompleted || isActive
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
                className={`w-8 h-0.5 mx-1 mb-4 ${idx < currentWizardIdx
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
            {showAdults && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Adults</span>
                <span className="text-gray-900 dark:text-gray-100">{adults}</span>
              </div>
            )}
            {showKids && (freeKids > 0 || paidKids > 0) && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Kids</span>
                <span className="text-gray-900 dark:text-gray-100">{freeKids + paidKids}</span>
              </div>
            )}
          </div>
          {attendeeNames.filter(Boolean).length > 0 && (
            <div className="space-y-1 text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
              <span className="text-gray-500 dark:text-gray-400">Attendee Details</span>
              {attendeeNames.filter(Boolean).map((name, i) => {
                const isKidEntry = isPerAdult && isPerKid ? i >= adults : isPerKid;
                return (
                  <div key={i} className="flex justify-between pl-2">
                    <span className="text-gray-700 dark:text-gray-300">{name}</span>
                    {isKidEntry && attendeeAges[i] && (
                      <span className="text-gray-500 dark:text-gray-400">Age {attendeeAges[i]}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                if (field.type === 'label') return null;
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
        {priceBreakdown && <PriceDisplay breakdown={priceBreakdown} />}
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

      {step === 'guest_blocked' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineExclamationTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            This event is open to members only. Join our community to register.
          </p>
          <a
            href="/membership/apply"
            className="mt-4 btn-primary w-full inline-block text-center"
          >
            Become a Member
          </a>
          <button
            onClick={() => router.push(`/events/${eventId}/home`)}
            className="mt-2 btn-secondary w-full"
          >
            Go to Event Page
          </button>
        </div>
      )}

      {step === 'pending_application' && (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineClock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Application Under Review</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            We found a membership application for <strong>{form.email}</strong> that is currently being reviewed by our Board of Directors.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Please wait for approval</strong> before registering for events. You will receive an email notification once your membership application has been reviewed.
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
              onClick={() => { setStep('identify'); setLookupEmail(''); }}
              className="btn-secondary w-full"
            >
              Try Different Email
            </button>
          </div>
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
              {eventData.date && (
                <p className="text-white/70 text-sm mb-2">
                  {(() => {
                    try {
                      return parseLocalDate(eventData.date).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
                      });
                    } catch { return eventData.date; }
                  })()}
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
                onClick={() => setStep('identify')}
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

      {/* Capacity / Waitlist Banner */}
      {(step === 'identify' || step === 'wizard' || step === 'payment') && eventData.capacity > 0 && (() => {
        const unitLabel = isPerAdult && isPerKid ? 'spot' : isPerAdult ? 'adult spot' : isPerKid ? 'kid spot' : 'spot';
        const unitLabelPlural = isPerAdult && isPerKid ? 'spots' : isPerAdult ? 'adult spots' : isPerKid ? 'kid spots' : 'spots';
        return eventData.spotsRemaining === 0 ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 mb-0">
            <div className="flex items-start gap-3">
              <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Event is at Full Capacity</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  New registrations will be added to the waitlist ({eventData.waitlistCount} currently waitlisted). You will be notified if a spot becomes available.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 mb-0">
            <div className="flex items-center gap-3">
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <span className="font-semibold">{eventData.spotsRemaining}</span> {eventData.spotsRemaining !== 1 ? unitLabelPlural : unitLabel} remaining out of {eventData.capacity}
              </div>
            </div>
          </div>
        );
      })()}

      {step === 'identify' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Register for Event</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter your email address to get started.</p>
          <div className="space-y-4">
            <div>
              <label className="label">Email or Phone</label>
              <input
                type="text"
                value={lookupEmail}
                onChange={(e) => { setLookupEmail(e.target.value); setFieldErrors((fe) => ({ ...fe, lookupEmail: null })); }}
                className={`input ${fieldErrors.lookupEmail ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <FieldError error={fieldErrors.lookupEmail} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">We&apos;ll look up your member or spouse details using either.</p>
            </div>
            <button onClick={handleLookup} disabled={!lookupEmail.trim() || !!fieldErrors.lookupEmail} className="btn-primary w-full">
              Look Up
            </button>
          </div>
        </div>
      )}

      {step === 'sign_in_required' && (
        <div className="card p-6">
          <SignInRequiredStep
            firstName={lookupResult?.name?.split(' ')[0] || form.name?.split(' ')[0]}
            callbackUrl={`/events/${eventId}/register`}
            showGuestOption={!shouldHideGuestOption(guestPolicy)}
            onContinueAsGuest={() => {
              // Let user continue as guest — send OTP for their email
              const emailToUse = otpEmail || lookupEmail.trim() || form.email;
              setOtpEmail(emailToUse);
              sendCheckinOTP(eventId, emailToUse).catch(() => {});
              setStep('otp_verify');
            }}
          />
        </div>
      )}

      {step === 'otp_verify' && (
        <div className="card p-6">
          <OTPStep
            email={otpEmail || lookupEmail.trim() || form.email}
            eventId={eventId}
            purpose="guest-registration"
            onVerified={handleOTPVerified}
            onBack={() => setStep('identify')}
          />
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
              href="/membership/apply"
              className="btn-primary w-full inline-block text-center"
            >
              Become a Member
            </a>
            {!shouldHideGuestOption(guestPolicy) && (
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
            Would you like to renew your membership, or continue registering as a guest?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setIsRenewing(true);
                setRenewalOnly(true);
                // Pre-select member's current type if it matches one of the available types
                const currentType = memberProfile?.membershipType || '';
                const match = membershipTypes.find((t) => t.name === currentType);
                setSelectedMembershipType(match || (membershipTypes.length > 0 ? membershipTypes[0] : null));
                setStep('renewal_options');
              }}
              className="btn-primary w-full"
            >
              Renew Membership
            </button>
            {(!guestPolicy || guestPolicy.allowGuests !== false) && guestPolicy?.guestAction !== 'blocked' && (
              <button
                onClick={() => {
                  setIsRenewing(false);
                  setRenewalOnly(false);
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
            )}
          </div>
        </div>
      )}

      {step === 'renewal_options' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Renew Membership</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select your membership type to continue.
          </p>
          {memberProfile?.membershipType && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Current type: <span className="font-medium">{memberProfile.membershipType}</span>
            </p>
          )}
          <div className="space-y-3 mb-6">
            {membershipTypes.map((type) => (
              <button
                key={type.name}
                onClick={() => setSelectedMembershipType(type)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${selectedMembershipType?.name === type.name
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className={`font-medium ${selectedMembershipType?.name === type.name ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {type.name}
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${selectedMembershipType?.name === type.name ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    ${type.price.toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {selectedMembershipType && (
            <button
              onClick={() => {
                if (PAYMENTS_ENABLED && selectedMembershipType.price > 0) {
                  setStep('renewal_payment');
                } else {
                  // Free renewal — call API directly
                  (async () => {
                    setStep('submitting');
                    try {
                      const res = await fetch('/api/members/renew', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          memberId: lookupResult?.memberId || '',
                          membershipType: selectedMembershipType.name,
                          amount: '0',
                          payerName: form.name,
                          payerEmail: form.email || lookupEmail.trim(),
                          eventName: eventName,
                        }),
                      });
                      const json = await res.json();
                      if (json.success) {
                        setMemberProfile((prev) => prev ? { ...prev, memberStatus: 'Active', membershipType: selectedMembershipType.name } : prev);
                        setLookupResult((prev) => prev ? { ...prev, memberStatus: 'Active', status: 'member_active' } : prev);
                        setRenewalPaymentInfo({ paymentStatus: '', paymentMethod: '', transactionId: '' });
                        setStep('renewal_success');
                      } else {
                        setErrorMsg(json.error || 'Renewal failed.');
                        setStep('error');
                      }
                    } catch {
                      setErrorMsg('Renewal failed.');
                      setStep('error');
                    }
                  })();
                }
              }}
              className="btn-primary w-full"
            >
              Renew — ${selectedMembershipType.price.toFixed(2)}
            </button>
          )}
          <button
            onClick={() => setStep('membership_expired')}
            className="mt-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline w-full text-center"
          >
            Go Back
          </button>
        </div>
      )}

      {step === 'already_registered' && lookupResult?.registrationData && (
        <div className="card p-6">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <HiOutlineCheckCircle className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">Already Registered</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
            This email is already registered for this event.
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Name</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{form.name}</span>
            </div>
            {showAdults && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Adults</span>
                <span className="text-gray-900 dark:text-gray-100">{lookupResult.registrationData.registeredAdults}</span>
              </div>
            )}
            {showKids && lookupResult.registrationData.registeredKids > 0 && (
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
          <div className="text-center">
            <a
              href={`/events/${eventId}/home`}
              className="btn-primary inline-flex items-center"
            >
              Go Back Home
            </a>
          </div>
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
              {hasFamilyData && (isPerAdult || isPerKid) && (
                <button
                  type="button"
                  onClick={prefillFamilyDetails}
                  className="text-sm text-primary-600 dark:text-primary-400 underline hover:text-primary-700 dark:hover:text-primary-300 text-left"
                >
                  Use family from profile
                </button>
              )}
              <AdultsKidsInputs />
              {(isPerAdult || isPerKid) && (() => {
                const adultCount = isPerAdult ? adults : 0;
                const kidCount = isPerKid ? (freeKids + paidKids) : 0;
                if (adultCount <= 0 && kidCount <= 0) return null;
                const totalCount = adultCount + kidCount;
                return (
                  <div className="space-y-3 mt-4">
                    <label className="label">Attendee Details <span className="text-red-500">*</span></label>
                    {isPerAdult && Array.from({ length: adultCount }, (_, i) => (
                      <div key={`adult-${i}`} className="flex gap-2">
                        <input
                          type="text"
                          value={attendeeNames[i] || ''}
                          onChange={(e) => {
                            const updated = [...attendeeNames];
                            while (updated.length < totalCount) updated.push('');
                            updated[i] = e.target.value;
                            setAttendeeNames(updated);
                            setFieldErrors((prev) => ({ ...prev, attendeeNames: null }));
                          }}
                          className="input flex-1"
                          placeholder={`Adult ${i + 1} name *`}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => removeAdult(i)}
                          className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <HiXMark className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {isPerKid && Array.from({ length: kidCount }, (_, i) => {
                      const idx = adultCount + i;
                      return (
                        <div key={`kid-${i}`} className="flex gap-2">
                          <input
                            type="text"
                            value={attendeeNames[idx] || ''}
                            onChange={(e) => {
                              const updated = [...attendeeNames];
                              while (updated.length <= idx) updated.push('');
                              updated[idx] = e.target.value;
                              setAttendeeNames(updated);
                              setFieldErrors((prev) => ({ ...prev, attendeeNames: null }));
                            }}
                            className="input flex-1"
                            placeholder={`Kid ${i + 1} name *`}
                            required
                          />
                          <input
                            type="number"
                            min="0"
                            max="17"
                            value={attendeeAges[idx] || ''}
                            onChange={(e) => {
                              const updated = [...attendeeAges];
                              while (updated.length <= idx) updated.push('');
                              updated[idx] = e.target.value;
                              setAttendeeAges(updated);
                              setFieldErrors((prev) => ({ ...prev, attendeeNames: null }));
                            }}
                            className="input w-20"
                            placeholder="Age *"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => removeKid(i)}
                            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Remove"
                          >
                            <HiXMark className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                    <FieldError error={fieldErrors.attendeeNames} />
                  </div>
                );
              })()}
              {formFields.length > 0 && (
                <div className="space-y-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Additional Information</h3>
                  {formFields.map((field) => (
                    <div key={field.id}>
                      {field.type === 'label' ? (
                        <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
                          {field.label}
                        </p>
                      ) : (
                        <>
                          <label className="label">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={customFieldValues[field.id] || ''}
                              onChange={(e) => {
                                setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }));
                                setFieldErrors((prev) => ({ ...prev, customFields: null }));
                              }}
                              className="input"
                              required={field.required}
                            >
                              <option value="">{field.placeholder || 'Select...'}</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              value={customFieldValues[field.id] || ''}
                              onChange={(e) => {
                                setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }));
                                setFieldErrors((prev) => ({ ...prev, customFields: null }));
                              }}
                              className="input"
                              placeholder={field.placeholder || ''}
                              required={field.required}
                              rows={3}
                            />
                          ) : field.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={customFieldValues[field.id] === 'true'}
                                onChange={(e) => {
                                  setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.checked ? 'true' : '' }));
                                  setFieldErrors((prev) => ({ ...prev, customFields: null }));
                                }}
                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-600 dark:text-gray-400">{field.placeholder || ''}</span>
                            </label>
                          ) : (
                            <input
                              type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
                              value={customFieldValues[field.id] || ''}
                              onChange={(e) => {
                                setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }));
                                setFieldErrors((prev) => ({ ...prev, customFields: null }));
                              }}
                              className="input"
                              placeholder={field.placeholder || ''}
                              required={field.required}
                            />
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <FieldError error={fieldErrors.customFields} />
                </div>
              )}
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

              {/* Consent Checkboxes */}
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
                Register
              </button>
            ) : (
              <button
                onClick={handleWizardNext}
                disabled={false}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'renewal_payment' && selectedMembershipType && (
        <PaymentForm
          amount={selectedMembershipType.price}
          eventId={eventId}
          eventName={`Membership Renewal — ${selectedMembershipType.name}`}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={async (result) => {
            const isZelle = result.method === 'zelle';
            setStep('submitting');
            try {
              const res = await fetch('/api/members/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  memberId: lookupResult?.memberId || '',
                  membershipType: selectedMembershipType.name,
                  amount: String(selectedMembershipType.price),
                  payerName: form.name,
                  payerEmail: form.email || lookupEmail.trim(),
                  paymentMethod: result.method,
                  transactionId: result.transactionId,
                  eventName: eventName,
                }),
              });
              const json = await res.json();
              if (json.success) {
                if (!isZelle) {
                  setMemberProfile((prev) => prev ? { ...prev, memberStatus: 'Active', membershipType: selectedMembershipType!.name } : prev);
                  setLookupResult((prev) => prev ? { ...prev, memberStatus: 'Active', status: 'member_active' } : prev);
                }
                setRenewalPaymentInfo({
                  paymentStatus: isZelle ? 'pending_zelle' : 'paid',
                  paymentMethod: result.method,
                  transactionId: result.transactionId,
                });
                setStep('renewal_success');
              } else {
                setErrorMsg(json.error || 'Renewal failed.');
                setStep('error');
              }
            } catch {
              setErrorMsg('Renewal failed.');
              setStep('error');
            }
          }}
          onCancel={async () => {
            // Skip payment — renew without payment
            setStep('submitting');
            try {
              const res = await fetch('/api/members/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  memberId: lookupResult?.memberId || '',
                  membershipType: selectedMembershipType.name,
                  amount: String(selectedMembershipType.price),
                  payerName: form.name,
                  payerEmail: form.email || lookupEmail.trim(),
                  eventName: eventName,
                }),
              });
              const json = await res.json();
              if (json.success) {
                setMemberProfile((prev) => prev ? { ...prev, memberStatus: 'Active', membershipType: selectedMembershipType.name } : prev);
                setLookupResult((prev) => prev ? { ...prev, memberStatus: 'Active', status: 'member_active' } : prev);
                setRenewalPaymentInfo({ paymentStatus: '', paymentMethod: '', transactionId: '' });
                setStep('renewal_success');
              } else {
                setErrorMsg(json.error || 'Renewal failed.');
                setStep('error');
              }
            } catch {
              setErrorMsg('Renewal failed.');
              setStep('error');
            }
          }}
          paypalFeePercent={feeSettings?.paypalFeePercent}
          paypalFeeFixed={feeSettings?.paypalFeeFixed}
          zelleEmail={feeSettings?.zelleEmail}
          zellePhone={feeSettings?.zellePhone}
          providers={['paypal', 'zelle']}
        />
      )}

      {step === 'renewal_success' && (() => {
        const isZelleRenewal = renewalPaymentInfo.paymentMethod === 'zelle';
        return (
          <div className="card p-6 text-center">
            <div className={`w-12 h-12 ${isZelleRenewal ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-full flex items-center justify-center mx-auto mb-3`}>
              {isZelleRenewal ? (
                <HiOutlineExclamationTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              ) : (
                <HiOutlineCheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isZelleRenewal ? 'Renewal On Hold' : 'Membership Renewed!'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{form.name}</p>
            {selectedMembershipType && (
              <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mt-1">
                {selectedMembershipType.name} — ${selectedMembershipType.price.toFixed(2)}
              </p>
            )}
            {isZelleRenewal ? (
              <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your Zelle payment is being verified. Your renewal will be processed once the committee confirms the payment, typically within <strong>1 business day</strong>.
                </p>
              </div>
            ) : renewalPaymentInfo.transactionId ? (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Payment confirmed ({renewalPaymentInfo.paymentMethod}) &mdash; {renewalPaymentInfo.transactionId}
              </p>
            ) : null}
            {isZelleRenewal ? (
              <button
                onClick={() => router.push(`/events/${eventId}/home`)}
                className="mt-4 btn-primary w-full"
              >
                Go to Event Page
              </button>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                  You can now register for the event as a member.
                </p>
                <button
                  onClick={() => {
                    setRenewalOnly(false);
                    setIsRenewing(false);
                    setRegType('Member');
                    setPaymentInfo({ paymentStatus: '', paymentMethod: '', transactionId: '' });
                    setWizardStep('profile_review');
                    setStep('wizard');
                  }}
                  className="mt-4 btn-primary w-full"
                >
                  Register for {eventName}
                </button>
                <button
                  onClick={() => router.push(`/events/${eventId}/home`)}
                  className="mt-2 btn-secondary w-full"
                >
                  Go to Event Page
                </button>
              </>
            )}
          </div>
        );
      })()}

      {step === 'payment' && priceBreakdown && (
        <PaymentForm
          amount={(() => {
            const eventTotal = priceBreakdown.total || 0;
            return isModifying ? Math.max(0, eventTotal - originalPaidAmount) : eventTotal;
          })()}
          eventId={eventId}
          eventName={eventName}
          payerName={form.name}
          payerEmail={form.email || lookupEmail.trim()}
          onSuccess={(result) => {
            const payment = {
              paymentStatus: result.method === 'zelle' ? 'pending_zelle' : 'paid',
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
          paypalFeePercent={feeSettings?.paypalFeePercent}
          paypalFeeFixed={feeSettings?.paypalFeeFixed}
          zelleEmail={feeSettings?.zelleEmail}
          zellePhone={feeSettings?.zellePhone}
          providers={['paypal', 'zelle']}
        />
      )}

      {step === 'submitting' && (
        <div className="card p-6 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{renewalOnly ? 'Renewing membership...' : isModifying ? 'Updating...' : 'Registering...'}</p>
        </div>
      )}

      {step === 'success' && (() => {
        const isZelleRegistration = paymentInfo.paymentMethod === 'zelle';
        const isOnHold = isZelleRegistration;
        return (
          <div className="card p-6 text-center">
            <div className={`w-12 h-12 ${isOnHold ? 'bg-amber-100 dark:bg-amber-900/30' : registrationStatus === 'waitlist' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'} rounded-full flex items-center justify-center mx-auto mb-3`}>
              {isOnHold || registrationStatus === 'waitlist' ? (
                <HiOutlineExclamationTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              ) : (
                <HiOutlineCheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isOnHold ? 'Registration On Hold' : isModifying ? 'Registration Updated!' : registrationStatus === 'waitlist' ? 'Added to Waitlist' : 'Registration Successful!'}
            </h2>
            {registrationStatus === 'waitlist' && !isOnHold && (
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mt-1">
                This event is at full capacity. You have been added to the waitlist and will be notified if a spot becomes available.
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{form.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{eventName}</p>
            {isOnHold ? (
              <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your Zelle payment is being verified. Your registration will be confirmed once the committee verifies the payment, typically within <strong>1 business day</strong>. Until then, your registration is <strong>on hold</strong>.
                </p>
              </div>
            ) : paymentInfo.transactionId ? (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Payment confirmed ({paymentInfo.paymentMethod}) &mdash; {paymentInfo.transactionId}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {new Date().toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago',
              })}
            </p>
            <button
              onClick={() => router.push(`/events/${eventId}/home`)}
              className="mt-4 btn-primary inline-flex items-center"
            >
              Go to Event Page
            </button>
          </div>
        );
      })()}
    </PublicLayout>
  );
}
