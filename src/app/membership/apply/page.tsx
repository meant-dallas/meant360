'use client';

import { useState, useEffect } from 'react';
import PublicLayout from '@/components/events/PublicLayout';
import PaymentForm from '@/components/events/PaymentForm';
import FieldError from '@/components/ui/FieldError';
import { HiOutlineCheckCircle, HiCheck, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

type WizardStep = 'personal' | 'address' | 'spouse' | 'children' | 'sponsor' | 'review' | 'payment' | 'success';

const STEP_ORDER: WizardStep[] = ['personal', 'address', 'spouse', 'children', 'sponsor', 'review', 'payment', 'success'];
const STEP_LABELS: Record<WizardStep, string> = {
  personal: 'Personal',
  address: 'Address',
  spouse: 'Spouse',
  children: 'Children',
  sponsor: 'Sponsor',
  review: 'Review',
  payment: 'Payment',
  success: 'Done',
};

interface MembershipTypeOption {
  name: string;
  price: number;
}

interface ChildEntry {
  name: string;
  age: string;
  sex: string;
  grade: string;
  dateOfBirth: string;
}

const emptyChild = (): ChildEntry => ({ name: '', age: '', sex: '', grade: '', dateOfBirth: '' });

export default function MembershipApplyPage() {
  const [step, setStep] = useState<WizardStep>('personal');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [membershipTypes, setMembershipTypes] = useState<MembershipTypeOption[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState('');
  const [feeSettings, setFeeSettings] = useState({ squareFeePercent: 0, squareFeeFixed: 0, paypalFeePercent: 0, paypalFeeFixed: 0 });

  // Sponsor info
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');

  // Personal info
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [qualifyingDegree, setQualifyingDegree] = useState('');
  const [nativePlace, setNativePlace] = useState('');
  const [college, setCollege] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const [specialInterests, setSpecialInterests] = useState('');

  // Address
  const [street, setStreet] = useState('');
  const [street2, setStreet2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('USA');

  // Spouse
  const [spouseFirstName, setSpouseFirstName] = useState('');
  const [spouseMiddleName, setSpouseMiddleName] = useState('');
  const [spouseLastName, setSpouseLastName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [spousePhone, setSpousePhone] = useState('');
  const [spouseNativePlace, setSpouseNativePlace] = useState('');
  const [spouseCompany, setSpouseCompany] = useState('');
  const [spouseCollege, setSpouseCollege] = useState('');
  const [spouseQualifyingDegree, setSpouseQualifyingDegree] = useState('');

  // Children
  const [children, setChildren] = useState<ChildEntry[]>([]);

  // Payment result
  const [paymentInfo, setPaymentInfo] = useState<{ method: string; transactionId: string } | null>(null);

  // Fetch settings
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const d = json.data;
          const types: MembershipTypeOption[] = d.membershipSettings?.membershipTypes || [];
          setMembershipTypes(types);
          if (d.feeSettings) {
            setFeeSettings({
              squareFeePercent: d.feeSettings.squareFeePercent || 0,
              squareFeeFixed: d.feeSettings.squareFeeFixed || 0,
              paypalFeePercent: d.feeSettings.paypalFeePercent || 0,
              paypalFeeFixed: d.feeSettings.paypalFeeFixed || 0,
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  const membershipCost = membershipTypes.find((t) => t.name === selectedMembershipType)?.price || 0;

  const stepIndex = STEP_ORDER.indexOf(step);

  function validatePersonal(): boolean {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address';
    if (!phone.trim() && !cellPhone.trim()) {
      e.phone = 'Phone or cell phone is required';
      e.cellPhone = 'Phone or cell phone is required';
    }
    if (!qualifyingDegree.trim()) e.qualifyingDegree = 'Qualifying degree is required';
    if (!college.trim()) e.college = 'College is required';
    if (!jobTitle.trim()) e.jobTitle = 'Job title is required';
    if (!employer.trim()) e.employer = 'Employer is required';
    if (membershipTypes.length > 0 && !selectedMembershipType) e.membershipType = 'Please select a membership type';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateAddress(): boolean {
    const e: Record<string, string> = {};
    if (!street.trim()) e.street = 'Street address is required';
    if (!city.trim()) e.city = 'City is required';
    if (!state.trim()) e.state = 'State is required';
    if (!zipCode.trim()) e.zipCode = 'Zip code is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateSponsor(): boolean {
    const e: Record<string, string> = {};
    if (!sponsorName.trim()) e.sponsorName = 'Sponsor name is required';
    if (!sponsorEmail.trim()) e.sponsorEmail = 'Sponsor email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorEmail)) e.sponsorEmail = 'Invalid email address';
    if (!sponsorPhone.trim()) e.sponsorPhone = 'Sponsor phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function goNext() {
    if (step === 'personal' && !validatePersonal()) return;
    if (step === 'address' && !validateAddress()) return;
    if (step === 'sponsor' && !validateSponsor()) return;
    setErrors({});
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEP_ORDER.length) setStep(STEP_ORDER[nextIdx]);
  }

  function goBack() {
    setErrors({});
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setStep(STEP_ORDER[prevIdx]);
  }

  function buildPayload() {
    return {
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      homePhone: homePhone.trim(),
      cellPhone: cellPhone.trim(),
      qualifyingDegree: qualifyingDegree.trim(),
      nativePlace: nativePlace.trim(),
      college: college.trim(),
      jobTitle: jobTitle.trim(),
      employer: employer.trim(),
      specialInterests: specialInterests.trim(),
      address: { street, street2, city, state, zipCode, country },
      spouse: spouseFirstName.trim() ? {
        firstName: spouseFirstName.trim(),
        middleName: spouseMiddleName.trim(),
        lastName: spouseLastName.trim(),
        email: spouseEmail.trim(),
        phone: spousePhone.trim(),
        nativePlace: spouseNativePlace.trim(),
        company: spouseCompany.trim(),
        college: spouseCollege.trim(),
        qualifyingDegree: spouseQualifyingDegree.trim(),
      } : null,
      children: children.filter((c) => c.name.trim()),
      membershipType: selectedMembershipType,
      sponsorName: sponsorName.trim(),
      sponsorEmail: sponsorEmail.trim(),
      sponsorPhone: sponsorPhone.trim(),
      amountPaid: paymentInfo ? String(membershipCost) : '0',
      paymentMethod: paymentInfo?.method || '',
      transactionId: paymentInfo?.transactionId || '',
      paymentStatus: paymentInfo ? 'Paid' : (membershipCost > 0 ? 'Pending' : ''),
    };
  }

  async function handleSubmitAfterPayment(payment: { method: string; transactionId: string }) {
    setPaymentInfo(payment);
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        ...buildPayload(),
        amountPaid: String(membershipCost),
        paymentMethod: payment.method,
        transactionId: payment.transactionId,
        paymentStatus: 'Paid',
      };
      const res = await fetch('/api/membership-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Submission failed');
      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkipPayment() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = buildPayload();
      const res = await fetch('/api/membership-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Submission failed');
      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  }

  function addChild() {
    setChildren([...children, emptyChild()]);
  }

  function removeChild(index: number) {
    setChildren(children.filter((_, i) => i !== index));
  }

  function updateChild(index: number, field: keyof ChildEntry, value: string) {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  // Step indicator (only show for wizard steps, not success; hide payment if disabled)
  const showPaymentStep = membershipCost > 0 && PAYMENTS_ENABLED;
  const wizardSteps = STEP_ORDER.filter((s) => s !== 'success' && (s !== 'payment' || showPaymentStep));

  return (
    <PublicLayout eventName="Membership Application" maxWidth="2xl">
      {/* Step indicator */}
      {step !== 'success' && (
        <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
          {wizardSteps.map((s, i) => {
            const isComplete = STEP_ORDER.indexOf(s) < stepIndex;
            const isCurrent = s === step;
            return (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {isComplete ? <HiCheck className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${isCurrent ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-400'}`}>
                  {STEP_LABELS[s]}
                </span>
                {i < wizardSteps.length - 1 && (
                  <div className={`w-4 h-px ${isComplete ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Personal Info Step */}
      {step === 'personal' && (
        <div className="card p-6 md:p-8 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Personal Information</h2>

          {/* Membership Type Selector */}
          {membershipTypes.length > 0 && (
            <div>
              <label className={labelClass}>Membership Type *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {membershipTypes.map((mt) => (
                  <label
                    key={mt.name}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedMembershipType === mt.name
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="membershipType"
                      value={mt.name}
                      checked={selectedMembershipType === mt.name}
                      onChange={(e) => setSelectedMembershipType(e.target.value)}
                      className="text-primary-600"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{mt.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">${mt.price}</span>
                  </label>
                ))}
              </div>
              <FieldError error={errors.membershipType} />
            </div>
          )}

          {/* Name */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Name</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <FieldError error={errors.firstName} />
              </div>
              <div>
                <label className={labelClass}>Middle Name</label>
                <input className={inputClass} value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                <FieldError error={errors.lastName} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Email *</label>
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <FieldError error={errors.email} />
              </div>
              <div>
                <label className={labelClass}>Phone *</label>
                <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(xxx) xxx-xxxx" />
                <FieldError error={errors.phone} />
                {!errors.phone && <p className="text-xs text-gray-400 mt-0.5">Either phone or cell phone is required</p>}
              </div>
              <div>
                <label className={labelClass}>Cell Phone *</label>
                <input className={inputClass} type="tel" value={cellPhone} onChange={(e) => setCellPhone(e.target.value)} placeholder="(xxx) xxx-xxxx" />
                <FieldError error={errors.cellPhone} />
              </div>
              <div>
                <label className={labelClass}>Home Phone</label>
                <input className={inputClass} type="tel" value={homePhone} onChange={(e) => setHomePhone(e.target.value)} placeholder="(xxx) xxx-xxxx" />
              </div>
            </div>
          </div>

          {/* Education & Work */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Education &amp; Work</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Qualifying Degree *</label>
                <input className={inputClass} value={qualifyingDegree} onChange={(e) => setQualifyingDegree(e.target.value)} placeholder="e.g. B.Tech, M.S." />
                <FieldError error={errors.qualifyingDegree} />
              </div>
              <div>
                <label className={labelClass}>College *</label>
                <input className={inputClass} value={college} onChange={(e) => setCollege(e.target.value)} />
                <FieldError error={errors.college} />
              </div>
              <div>
                <label className={labelClass}>Job Title *</label>
                <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                <FieldError error={errors.jobTitle} />
              </div>
              <div>
                <label className={labelClass}>Employer *</label>
                <input className={inputClass} value={employer} onChange={(e) => setEmployer(e.target.value)} />
                <FieldError error={errors.employer} />
              </div>
              <div>
                <label className={labelClass}>Native Place</label>
                <input className={inputClass} value={nativePlace} onChange={(e) => setNativePlace(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Special Interests</label>
            <textarea className={inputClass} rows={2} value={specialInterests} onChange={(e) => setSpecialInterests(e.target.value)} placeholder="Hobbies, volunteer interests, etc." />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={goNext} className="btn-primary px-8 py-2.5">Next</button>
          </div>
        </div>
      )}

      {/* Address Step */}
      {step === 'address' && (
        <div className="card p-6 md:p-8 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Street *</label>
              <input className={inputClass} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street address" />
              <FieldError error={errors.street} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Street 2</label>
              <input className={inputClass} value={street2} onChange={(e) => setStreet2(e.target.value)} placeholder="Apt, Suite, Unit, etc." />
            </div>
            <div>
              <label className={labelClass}>City *</label>
              <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              <FieldError error={errors.city} />
            </div>
            <div>
              <label className={labelClass}>State *</label>
              <input className={inputClass} value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. TX" />
              <FieldError error={errors.state} />
            </div>
            <div>
              <label className={labelClass}>Zip Code *</label>
              <input className={inputClass} value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="e.g. 75001" />
              <FieldError error={errors.zipCode} />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={goBack} className="btn-secondary px-8 py-2.5">Back</button>
            <button onClick={goNext} className="btn-primary px-8 py-2.5">Next</button>
          </div>
        </div>
      )}

      {/* Spouse Step */}
      {step === 'spouse' && (
        <div className="card p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Spouse Information</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Optional — fill in if applicable.</p>
          </div>

          {/* Name */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Name</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>First Name</label>
                <input className={inputClass} value={spouseFirstName} onChange={(e) => setSpouseFirstName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Middle Name</label>
                <input className={inputClass} value={spouseMiddleName} onChange={(e) => setSpouseMiddleName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Last Name</label>
                <input className={inputClass} value={spouseLastName} onChange={(e) => setSpouseLastName(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} type="email" value={spouseEmail} onChange={(e) => setSpouseEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input className={inputClass} type="tel" value={spousePhone} onChange={(e) => setSpousePhone(e.target.value)} placeholder="(xxx) xxx-xxxx" />
              </div>
            </div>
          </div>

          {/* Background */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Background</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Native Place</label>
                <input className={inputClass} value={spouseNativePlace} onChange={(e) => setSpouseNativePlace(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Company</label>
                <input className={inputClass} value={spouseCompany} onChange={(e) => setSpouseCompany(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>College</label>
                <input className={inputClass} value={spouseCollege} onChange={(e) => setSpouseCollege(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Qualifying Degree</label>
                <input className={inputClass} value={spouseQualifyingDegree} onChange={(e) => setSpouseQualifyingDegree(e.target.value)} placeholder="e.g. B.Tech, M.S." />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={goBack} className="btn-secondary px-8 py-2.5">Back</button>
            <button onClick={goNext} className="btn-primary px-8 py-2.5">Next</button>
          </div>
        </div>
      )}

      {/* Children Step */}
      {step === 'children' && (
        <div className="card p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Children</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Optional — add children if applicable.</p>
          </div>
          {children.map((child, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Child {i + 1}</span>
                <button onClick={() => removeChild(i)} className="text-red-500 hover:text-red-700 p-1">
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Name</label>
                  <input className={inputClass} value={child.name} onChange={(e) => updateChild(i, 'name', e.target.value)} placeholder="Child's full name" />
                </div>
                <div>
                  <label className={labelClass}>Date of Birth</label>
                  <input className={inputClass} type="date" value={child.dateOfBirth} onChange={(e) => updateChild(i, 'dateOfBirth', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Age</label>
                  <input className={inputClass} value={child.age} onChange={(e) => updateChild(i, 'age', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Sex</label>
                  <select className={inputClass} value={child.sex} onChange={(e) => updateChild(i, 'sex', e.target.value)}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Grade</label>
                  <input className={inputClass} value={child.grade} onChange={(e) => updateChild(i, 'grade', e.target.value)} placeholder="e.g. 5th" />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addChild}
            className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 py-2"
          >
            <HiOutlinePlus className="w-4 h-4" /> Add Child
          </button>
          <div className="flex justify-between pt-2">
            <button onClick={goBack} className="btn-secondary px-8 py-2.5">Back</button>
            <button onClick={goNext} className="btn-primary px-8 py-2.5">Next</button>
          </div>
        </div>
      )}

      {/* Sponsor Step */}
      {step === 'sponsor' && (
        <div className="card p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sponsoring Member Details</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Provide details of an existing MEANT member who is sponsoring your application.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Sponsor Name *</label>
              <input className={inputClass} value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Full name of sponsoring member" />
              <FieldError error={errors.sponsorName} />
            </div>
            <div>
              <label className={labelClass}>Sponsor Email *</label>
              <input className={inputClass} type="email" value={sponsorEmail} onChange={(e) => setSponsorEmail(e.target.value)} placeholder="sponsor@example.com" />
              <FieldError error={errors.sponsorEmail} />
            </div>
            <div>
              <label className={labelClass}>Sponsor Phone *</label>
              <input className={inputClass} type="tel" value={sponsorPhone} onChange={(e) => setSponsorPhone(e.target.value)} placeholder="(xxx) xxx-xxxx" />
              <FieldError error={errors.sponsorPhone} />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={goBack} className="btn-secondary px-8 py-2.5">Back</button>
            <button onClick={goNext} className="btn-primary px-8 py-2.5">Next</button>
          </div>
        </div>
      )}

      {/* Review Step */}
      {step === 'review' && (
        <div className="card p-6 md:p-8 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Review Your Application</h2>

          {submitError && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Personal */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Personal</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-1.5">
                <p><span className="text-gray-500">Name:</span> {firstName} {middleName} {lastName}</p>
                <p><span className="text-gray-500">Email:</span> {email}</p>
                <p><span className="text-gray-500">Phone:</span> {phone || cellPhone || homePhone || '-'}</p>
                {qualifyingDegree && <p><span className="text-gray-500">Degree:</span> {qualifyingDegree}</p>}
                {college && <p><span className="text-gray-500">College:</span> {college}</p>}
                {employer && <p><span className="text-gray-500">Employer:</span> {employer}</p>}
                {jobTitle && <p><span className="text-gray-500">Job Title:</span> {jobTitle}</p>}
                {nativePlace && <p><span className="text-gray-500">Native Place:</span> {nativePlace}</p>}
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Address</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-1.5">
                <p>{street}{street2 ? `, ${street2}` : ''}</p>
                <p>{city}, {state} {zipCode}</p>
                <p>{country}</p>
              </div>
            </div>

            {/* Spouse */}
            {spouseFirstName && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Spouse</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-1.5">
                  <p><span className="text-gray-500">Name:</span> {spouseFirstName} {spouseMiddleName} {spouseLastName}</p>
                  {spouseEmail && <p><span className="text-gray-500">Email:</span> {spouseEmail}</p>}
                  {spousePhone && <p><span className="text-gray-500">Phone:</span> {spousePhone}</p>}
                </div>
              </div>
            )}

            {/* Sponsor */}
            {sponsorName && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Sponsoring Member</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-1.5">
                  <p><span className="text-gray-500">Name:</span> {sponsorName}</p>
                  {sponsorEmail && <p><span className="text-gray-500">Email:</span> {sponsorEmail}</p>}
                  {sponsorPhone && <p><span className="text-gray-500">Phone:</span> {sponsorPhone}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Children */}
          {children.filter((c) => c.name).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Children</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-1.5">
                {children.filter((c) => c.name).map((c, i) => (
                  <p key={i}>{c.name} {c.age ? `(Age: ${c.age})` : ''} {c.sex ? `- ${c.sex}` : ''} {c.grade ? `- Grade: ${c.grade}` : ''}</p>
                ))}
              </div>
            </div>
          )}

          {/* Membership Type & Cost */}
          {(selectedMembershipType || membershipCost > 0) && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-4">
              {selectedMembershipType && (
                <p className="text-sm text-primary-700 dark:text-primary-300">
                  Membership Type: <span className="font-semibold">{selectedMembershipType}</span>
                </p>
              )}
              {membershipCost > 0 && (
                <p className="text-sm text-primary-700 dark:text-primary-300">
                  Membership Fee: <span className="font-semibold">${membershipCost}</span>
                </p>
              )}
              {membershipCost > 0 && PAYMENTS_ENABLED && (
                <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                  Payment will be collected in the next step.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={goBack} className="btn-secondary px-8 py-2.5">Back</button>
            {membershipCost > 0 && PAYMENTS_ENABLED ? (
              <button onClick={goNext} className="btn-primary px-8 py-2.5">Proceed to Payment</button>
            ) : (
              <button onClick={handleSkipPayment} disabled={submitting} className="btn-primary px-8 py-2.5">
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Payment Step */}
      {step === 'payment' && (
        <div className="space-y-4">
          {submitError && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>
            </div>
          )}

          {submitting ? (
            <div className="card p-6 text-center">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Submitting your application...</p>
            </div>
          ) : (
            <PaymentForm
              amount={membershipCost}
              eventId="membership"
              eventName="MEANT Membership"
              payerName={`${firstName} ${lastName}`.trim()}
              payerEmail={email}
              onSuccess={handleSubmitAfterPayment}
              onCancel={handleSkipPayment}
              squareFeePercent={feeSettings.squareFeePercent}
              squareFeeFixed={feeSettings.squareFeeFixed}
              paypalFeePercent={feeSettings.paypalFeePercent}
              paypalFeeFixed={feeSettings.paypalFeeFixed}
            />
          )}

          {!submitting && (
            <div className="text-center">
              <button onClick={goBack} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline">
                Back to Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success Step */}
      {step === 'success' && (
        <div className="card p-8 text-center space-y-4">
          <HiOutlineCheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Application Submitted!</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Thank you for applying for MEANT membership. Your application has been received and will be reviewed by the Board of Directors.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You will receive an email confirmation shortly, and another once your application has been approved by the Board of Directors.
          </p>
          <a
            href="/"
            className="inline-block mt-4 btn-primary px-6"
          >
            Return Home
          </a>
        </div>
      )}
    </PublicLayout>
  );
}
