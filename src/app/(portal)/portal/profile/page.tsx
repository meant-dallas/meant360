'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, calculateAge, formatPhone, stripPhone } from '@/lib/utils';
import toast from 'react-hot-toast';
import { analytics } from '@/lib/analytics';
import {
  HiOutlinePencilSquare,
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

interface AddressData {
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface SpouseData {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  nativePlace: string;
  company: string;
  college: string;
  qualifyingDegree: string;
}

interface ChildData {
  name: string;
  age: string;
  sex: string;
  grade: string;
  dateOfBirth: string;
}

interface PaymentData {
  product: string;
  amount: string;
  payerName: string;
  payerEmail: string;
  transactionId: string;
}

interface SponsorData {
  name: string;
  email: string;
  phone: string;
}

interface ProfileData {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  homePhone: string;
  cellPhone: string;
  qualifyingDegree: string;
  nativePlace: string;
  college: string;
  jobTitle: string;
  employer: string;
  specialInterests: string;
  address: AddressData | null;
  spouse: SpouseData | null;
  children: ChildData[];
  membershipType: string;
  membershipLevel: string;
  membershipYears: { year: string; status: string }[];
  registrationDate: string;
  renewalDate: string;
  status: string;
  payments: PaymentData[];
  sponsor: SponsorData | null;
}

type EditSection = 'personal' | 'contact' | 'spouse' | 'children' | null;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const emptyAddress: AddressData = { street: '', street2: '', city: '', state: '', zipCode: '', country: '' };
const emptySpouse: SpouseData = { firstName: '', middleName: '', lastName: '', email: '', phone: '', nativePlace: '', company: '', college: '', qualifyingDegree: '' };

function handlePhoneChange(value: string, setter: (v: string) => void) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  setter(formatPhone(digits) || digits);
}
function handleNameChange(value: string, setter: (v: string) => void, maxLen = 50) {
  const cleaned = value.replace(/[^a-zA-Z\s'.,-]/g, '').slice(0, maxLen);
  setter(cleaned);
}
function handleEmailChange(value: string, setter: (v: string) => void) {
  setter(value.replace(/\s/g, '').slice(0, 100));
}
function handleZipChange(value: string, setter: (v: AddressData) => void, addr: AddressData) {
  const digits = value.replace(/\D/g, '').slice(0, 5);
  setter({ ...addr, zipCode: digits });
}
function handleStateChange(value: string, setter: (v: AddressData) => void, addr: AddressData) {
  const letters = value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
  setter({ ...addr, state: letters });
}
function validatePhoneNumber(value: string): string | null {
  if (!value.trim()) return null;
  const digits = stripPhone(value);
  if (digits.length !== 10) return 'Phone number must be 10 digits';
  return null;
}
function validateEmailField(value: string): string | null {
  if (!value.trim()) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email address';
  return null;
}

export default function MemberProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>(null);

  // Editable form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [qualifyingDegree, setQualifyingDegree] = useState('');
  const [nativePlace, setNativePlace] = useState('');
  const [college, setCollege] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const [specialInterests, setSpecialInterests] = useState('');
  const [address, setAddress] = useState<AddressData>(emptyAddress);
  const [spouse, setSpouse] = useState<SpouseData>(emptySpouse);
  const [children, setChildren] = useState<ChildData[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/profile');
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
        setFirstName(json.data.firstName || '');
        setMiddleName(json.data.middleName || '');
        setLastName(json.data.lastName || '');
        setPhone(json.data.phone || '');
        setHomePhone(json.data.homePhone || '');
        setCellPhone(json.data.cellPhone || '');
        setQualifyingDegree(json.data.qualifyingDegree || '');
        setNativePlace(json.data.nativePlace || '');
        setCollege(json.data.college || '');
        setJobTitle(json.data.jobTitle || '');
        setEmployer(json.data.employer || '');
        setSpecialInterests(json.data.specialInterests || '');
        setAddress(json.data.address || emptyAddress);
        setSpouse(json.data.spouse || emptySpouse);
        setChildren(json.data.children || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const startEdit = (section: EditSection) => {
    if (!profile) return;
    setFirstName(profile.firstName || '');
    setMiddleName(profile.middleName || '');
    setLastName(profile.lastName || '');
    setPhone(profile.phone || '');
    setHomePhone(profile.homePhone || '');
    setCellPhone(profile.cellPhone || '');
    setQualifyingDegree(profile.qualifyingDegree || '');
    setNativePlace(profile.nativePlace || '');
    setCollege(profile.college || '');
    setJobTitle(profile.jobTitle || '');
    setEmployer(profile.employer || '');
    setSpecialInterests(profile.specialInterests || '');
    setAddress(profile.address || emptyAddress);
    setSpouse(profile.spouse || emptySpouse);
    setChildren(profile.children || []);
    setFieldErrors({});
    setEditSection(section);
  };

  const cancelEdit = () => {
    setEditSection(null);
    setFieldErrors({});
  };

  const isFamilyMembership = profile?.membershipType?.toLowerCase().includes('family');
  const spouseMissing = isFamilyMembership && (!profile?.spouse?.firstName?.trim() || !profile?.spouse?.lastName?.trim() || !profile?.spouse?.email?.trim());

  const saveSection = async (section: EditSection) => {
    if (!section) return;

    // Validate
    const errors: Record<string, string | null> = {};
    if (section === 'contact') {
      errors.phone = validatePhoneNumber(phone);
      errors.homePhone = validatePhoneNumber(homePhone);
      errors.cellPhone = validatePhoneNumber(cellPhone);
      if (address.state && address.state.length !== 2) errors.state = 'State must be 2 letters';
      if (address.zipCode && address.zipCode.length !== 5) errors.zipCode = 'Zip must be 5 digits';
    } else if (section === 'spouse') {
      if (isFamilyMembership) {
        if (!spouse.firstName.trim()) errors.spouseFirstName = 'First name is required for Family membership';
        if (!spouse.lastName.trim()) errors.spouseLastName = 'Last name is required for Family membership';
        if (!spouse.email.trim()) errors.spouseEmail = 'Email is required for Family membership';
        else { const ve = validateEmailField(spouse.email); if (ve) errors.spouseEmail = ve; }
      } else {
        errors.spouseEmail = validateEmailField(spouse.email);
      }
      errors.spousePhone = validatePhoneNumber(spouse.phone);
    }

    setFieldErrors(errors);
    if (Object.values(errors).some((e) => e)) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (section === 'personal') {
        payload.firstName = firstName;
        payload.middleName = middleName;
        payload.lastName = lastName;
        payload.qualifyingDegree = qualifyingDegree;
        payload.nativePlace = nativePlace;
        payload.college = college;
        payload.jobTitle = jobTitle;
        payload.employer = employer;
        payload.specialInterests = specialInterests;
      } else if (section === 'contact') {
        payload.phone = phone;
        payload.homePhone = homePhone;
        payload.cellPhone = cellPhone;
        payload.address = address;
      } else if (section === 'spouse') {
        payload.spouse = spouse;
      } else if (section === 'children') {
        payload.children = children.filter((c) => c.name.trim());
      }

      const res = await fetch('/api/portal/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Profile updated');
        analytics.profileUpdated(section);
        setEditSection(null);
        await loadProfile();
      } else {
        toast.error(json.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Failed to load profile.</p>
      </div>
    );
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.name;
  const spouseDisplayName = profile.spouse
    ? [profile.spouse.firstName, profile.spouse.lastName].filter(Boolean).join(' ')
    : '';
  const hasSpouseData = !!(profile.spouse && (profile.spouse.firstName || profile.spouse.email));
  const addressDisplay = profile.address
    ? [profile.address.street, profile.address.street2, profile.address.city, profile.address.state, profile.address.zipCode, profile.address.country].filter(Boolean).join(', ')
    : '';
  const membershipYearsDisplay = profile.membershipYears?.map(m => m.year).join(', ') || '';

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Profile</h1>
      </motion.div>

      {spouseMissing && (
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 p-4">
            <div className="flex items-start gap-3">
              <HiOutlineExclamationTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Your membership type is <span className="font-semibold">Family Membership</span>. Please update the Spouse section below with the required details (first name, last name, and email).
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Read-only membership info */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Membership
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Name</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{displayName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Type</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.membershipType}</p>
            </div>
            {profile.membershipLevel && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Level</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.membershipLevel}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Status</p>
              <StatusBadge status={profile.status} />
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Years</p>
              <p className="text-gray-900 dark:text-gray-100">{membershipYearsDisplay || '—'}</p>
            </div>
            {profile.registrationDate && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Registration Date</p>
                <p className="text-gray-900 dark:text-gray-100">{formatDate(profile.registrationDate)}</p>
              </div>
            )}
            {profile.renewalDate && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Renewal Date</p>
                <p className="text-gray-900 dark:text-gray-100">{formatDate(profile.renewalDate)}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Personal Details section (editable) */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Personal Details
            </h2>
            {editSection !== 'personal' ? (
              <button onClick={() => startEdit('personal')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline">
                <HiOutlinePencilSquare className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="text-gray-500 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineXMark className="w-4 h-4" /> Cancel
                </button>
                <button onClick={() => saveSection('personal')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {editSection === 'personal' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First Name</label>
                  <input type="text" value={firstName} onChange={(e) => handleNameChange(e.target.value, setFirstName)} maxLength={50} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Middle Name</label>
                  <input type="text" value={middleName} onChange={(e) => handleNameChange(e.target.value, setMiddleName)} maxLength={50} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last Name</label>
                  <input type="text" value={lastName} onChange={(e) => handleNameChange(e.target.value, setLastName)} maxLength={50} className="input w-full" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Qualifying Degree</label>
                  <input type="text" value={qualifyingDegree} onChange={(e) => setQualifyingDegree(e.target.value.slice(0, 100))} maxLength={100} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Native Place</label>
                  <input type="text" value={nativePlace} onChange={(e) => setNativePlace(e.target.value.slice(0, 100))} maxLength={100} className="input w-full" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">College</label>
                  <input type="text" value={college} onChange={(e) => setCollege(e.target.value.slice(0, 100))} maxLength={100} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Job Title</label>
                  <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value.slice(0, 100))} maxLength={100} className="input w-full" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Employer</label>
                  <input type="text" value={employer} onChange={(e) => setEmployer(e.target.value.slice(0, 100))} maxLength={100} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Special Interests</label>
                  <input type="text" value={specialInterests} onChange={(e) => setSpecialInterests(e.target.value.slice(0, 200))} maxLength={200} className="input w-full" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.qualifyingDegree && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Qualifying Degree</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.qualifyingDegree}</p>
                </div>
              )}
              {profile.nativePlace && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Native Place</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.nativePlace}</p>
                </div>
              )}
              {profile.college && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">College</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.college}</p>
                </div>
              )}
              {profile.jobTitle && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Job Title</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.jobTitle}</p>
                </div>
              )}
              {profile.employer && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Employer</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.employer}</p>
                </div>
              )}
              {profile.specialInterests && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Special Interests</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.specialInterests}</p>
                </div>
              )}
              {!profile.qualifyingDegree && !profile.nativePlace && !profile.college && !profile.jobTitle && !profile.employer && !profile.specialInterests && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No personal details added yet.</p>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Contact section */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Contact
            </h2>
            {editSection !== 'contact' ? (
              <button onClick={() => startEdit('contact')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline">
                <HiOutlinePencilSquare className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="text-gray-500 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineXMark className="w-4 h-4" /> Cancel
                </button>
                <button onClick={() => saveSection('contact')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {editSection === 'contact' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={(e) => handlePhoneChange(e.target.value, setPhone)} className="input w-full" />
                  {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Home Phone</label>
                  <input type="tel" value={homePhone} onChange={(e) => handlePhoneChange(e.target.value, setHomePhone)} className="input w-full" />
                  {fieldErrors.homePhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.homePhone}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cell Phone</label>
                  <input type="tel" value={cellPhone} onChange={(e) => handlePhoneChange(e.target.value, setCellPhone)} className="input w-full" />
                  {fieldErrors.cellPhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.cellPhone}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Street</label>
                <input type="text" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value.slice(0, 200) })} maxLength={200} className="input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Street 2</label>
                <input type="text" value={address.street2} onChange={(e) => setAddress({ ...address, street2: e.target.value.slice(0, 200) })} maxLength={200} className="input w-full" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">City</label>
                  <input type="text" value={address.city} onChange={(e) => handleNameChange(e.target.value, (v) => setAddress({ ...address, city: v }))} maxLength={50} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">State</label>
                  <input type="text" value={address.state} onChange={(e) => handleStateChange(e.target.value, setAddress, address)} maxLength={2} className="input w-full" />
                  {fieldErrors.state && <p className="text-xs text-red-500 mt-1">{fieldErrors.state}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Zip</label>
                  <input type="text" inputMode="numeric" value={address.zipCode} onChange={(e) => handleZipChange(e.target.value, setAddress, address)} maxLength={5} className="input w-full" />
                  {fieldErrors.zipCode && <p className="text-xs text-red-500 mt-1">{fieldErrors.zipCode}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Country</label>
                  <input type="text" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value.slice(0, 50) })} maxLength={50} className="input w-full" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.phone || '—'}</p>
              </div>
              {profile.homePhone && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Home Phone</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.homePhone}</p>
                </div>
              )}
              {profile.cellPhone && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Cell Phone</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.cellPhone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Address</p>
                <p className="text-gray-900 dark:text-gray-100">{addressDisplay || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Spouse section */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
              Spouse
              {spouseMissing && <span className="text-xs font-medium text-red-500 normal-case">— Required</span>}
            </h2>
            {editSection !== 'spouse' ? (
              <button onClick={() => startEdit('spouse')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline">
                <HiOutlinePencilSquare className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="text-gray-500 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineXMark className="w-4 h-4" /> Cancel
                </button>
                <button onClick={() => saveSection('spouse')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {editSection === 'spouse' ? (
            <div className="space-y-4">
              {profile.membershipType?.toLowerCase().includes('family') && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Spouse first name, last name, and email are required for Family membership.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First Name {profile.membershipType?.toLowerCase().includes('family') && <span className="text-red-500">*</span>}</label>
                  <input type="text" value={spouse.firstName} onChange={(e) => handleNameChange(e.target.value, (v) => setSpouse({ ...spouse, firstName: v }))} maxLength={50} className="input w-full" />
                  {fieldErrors.spouseFirstName && <p className="text-xs text-red-500 mt-1">{fieldErrors.spouseFirstName}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Middle Name</label>
                  <input type="text" value={spouse.middleName} onChange={(e) => handleNameChange(e.target.value, (v) => setSpouse({ ...spouse, middleName: v }))} maxLength={50} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last Name {profile.membershipType?.toLowerCase().includes('family') && <span className="text-red-500">*</span>}</label>
                  <input type="text" value={spouse.lastName} onChange={(e) => handleNameChange(e.target.value, (v) => setSpouse({ ...spouse, lastName: v }))} maxLength={50} className="input w-full" />
                  {fieldErrors.spouseLastName && <p className="text-xs text-red-500 mt-1">{fieldErrors.spouseLastName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email {profile.membershipType?.toLowerCase().includes('family') && <span className="text-red-500">*</span>}</label>
                <input type="email" value={spouse.email} onChange={(e) => handleEmailChange(e.target.value, (v) => setSpouse({ ...spouse, email: v }))} maxLength={100} className="input w-full" />
                {fieldErrors.spouseEmail && <p className="text-xs text-red-500 mt-1">{fieldErrors.spouseEmail}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                <input type="tel" value={spouse.phone} onChange={(e) => handlePhoneChange(e.target.value, (v) => setSpouse({ ...spouse, phone: v }))} className="input w-full" />
                {fieldErrors.spousePhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.spousePhone}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Native Place</label>
                  <input type="text" value={spouse.nativePlace} onChange={(e) => setSpouse({ ...spouse, nativePlace: e.target.value.slice(0, 100) })} maxLength={100} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Company</label>
                  <input type="text" value={spouse.company} onChange={(e) => setSpouse({ ...spouse, company: e.target.value.slice(0, 100) })} maxLength={100} className="input w-full" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">College</label>
                  <input type="text" value={spouse.college} onChange={(e) => setSpouse({ ...spouse, college: e.target.value.slice(0, 100) })} maxLength={100} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Qualifying Degree</label>
                  <input type="text" value={spouse.qualifyingDegree} onChange={(e) => setSpouse({ ...spouse, qualifyingDegree: e.target.value.slice(0, 100) })} maxLength={100} className="input w-full" />
                </div>
              </div>
            </div>
          ) : hasSpouseData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Name</p>
                <p className="text-gray-900 dark:text-gray-100">{spouseDisplayName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.spouse?.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.spouse?.phone || '—'}</p>
              </div>
              {profile.spouse?.nativePlace && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Native Place</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.spouse.nativePlace}</p>
                </div>
              )}
              {profile.spouse?.company && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Company</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.spouse.company}</p>
                </div>
              )}
              {profile.spouse?.college && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">College</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.spouse.college}</p>
                </div>
              )}
              {profile.spouse?.qualifyingDegree && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Qualifying Degree</p>
                  <p className="text-gray-900 dark:text-gray-100">{profile.spouse.qualifyingDegree}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No spouse details added.</p>
          )}
        </div>
      </motion.div>

      {/* Children section */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Children
            </h2>
            {editSection !== 'children' ? (
              <button onClick={() => startEdit('children')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline">
                <HiOutlinePencilSquare className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={cancelEdit} className="text-gray-500 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineXMark className="w-4 h-4" /> Cancel
                </button>
                <button onClick={() => saveSection('children')} className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline" disabled={saving}>
                  <HiOutlineCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {editSection === 'children' ? (
            <div className="space-y-3">
              {children.map((child, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Name"
                    value={child.name}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^a-zA-Z\s'.,-]/g, '').slice(0, 50);
                      const updated = [...children];
                      updated[index] = { ...updated[index], name: cleaned };
                      setChildren(updated);
                    }}
                    maxLength={50}
                    className="input flex-1"
                  />
                  <select
                    value={child.dateOfBirth?.slice(5, 7) || ''}
                    onChange={(e) => {
                      const yr = child.dateOfBirth?.slice(0, 4) || '0000';
                      const dob = e.target.value ? `${yr}-${e.target.value}` : '';
                      const updated = [...children];
                      updated[index] = { ...updated[index], dateOfBirth: dob, age: calculateAge(dob) };
                      setChildren(updated);
                    }}
                    className="select w-20"
                  >
                    <option value="">Mon</option>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                      <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>
                    ))}
                  </select>
                  <select
                    value={child.dateOfBirth?.slice(0, 4) === '0000' ? '' : (child.dateOfBirth?.slice(0, 4) || '')}
                    onChange={(e) => {
                      const mo = child.dateOfBirth?.slice(5, 7) || '01';
                      const dob = e.target.value ? `${e.target.value}-${mo}` : '';
                      const updated = [...children];
                      updated[index] = { ...updated[index], dateOfBirth: dob, age: calculateAge(dob) };
                      setChildren(updated);
                    }}
                    className="select w-20"
                  >
                    <option value="">Year</option>
                    {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={calculateAge(child.dateOfBirth) || child.age}
                    disabled
                    className="input w-16 !bg-gray-100 dark:!bg-gray-700 cursor-not-allowed"
                  />
                  <select
                    value={child.sex}
                    onChange={(e) => {
                      const updated = [...children];
                      updated[index] = { ...updated[index], sex: e.target.value };
                      setChildren(updated);
                    }}
                    className="select w-20"
                  >
                    <option value="">Sex</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                  <button
                    onClick={() => setChildren(children.filter((_, i) => i !== index))}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setChildren([...children, { name: '', age: '', sex: '', grade: '', dateOfBirth: '' }])}
                className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline"
              >
                <HiOutlinePlus className="w-4 h-4" /> Add Child
              </button>
            </div>
          ) : profile.children.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No children added.</p>
          ) : (
            <div className="space-y-2">
              {profile.children.map((child, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-900 dark:text-gray-100">{child.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{(calculateAge(child.dateOfBirth) || child.age) ? `Age ${calculateAge(child.dateOfBirth) || child.age}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
      {/* Read-only Payments section */}
      {profile.payments && profile.payments.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
              Payments
            </h2>
            <div className="space-y-3">
              {profile.payments.map((payment, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Product: </span>
                      <span className="text-gray-900 dark:text-gray-100">{payment.product || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Amount: </span>
                      <span className="text-gray-900 dark:text-gray-100">{payment.amount || '—'}</span>
                    </div>
                    {payment.payerName && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Payer: </span>
                        <span className="text-gray-900 dark:text-gray-100">{payment.payerName}</span>
                      </div>
                    )}
                    {payment.transactionId && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Transaction: </span>
                        <span className="text-gray-900 dark:text-gray-100">{payment.transactionId}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Read-only Sponsor section */}
      {profile.sponsor && (profile.sponsor.name || profile.sponsor.email) && (
        <motion.div variants={itemVariants}>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
              Sponsor
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Name</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.sponsor.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.sponsor.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.sponsor.phone || '—'}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
