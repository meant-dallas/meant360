'use client';

import { useState } from 'react';
import { HiOutlinePencil, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';

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
  nativePlace?: string;
  company?: string;
  college?: string;
  qualifyingDegree?: string;
}

interface ChildData {
  name: string;
  age: string;
  sex?: string;
  grade?: string;
  dateOfBirth?: string;
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
  memberStatus: string;
  payments: PaymentData[];
  sponsors: SponsorData[];
}

interface ProfileReviewStepProps {
  profile: ProfileData;
  memberName: string;
  onChange: (updated: ProfileData) => void;
}

const emptySpouse: SpouseData = { firstName: '', middleName: '', lastName: '', email: '', phone: '' };

export default function ProfileReviewStep({ profile, memberName, onChange }: ProfileReviewStepProps) {
  const [editingSection, setEditingSection] = useState<'contact' | 'spouse' | 'children' | null>(null);

  const hasSpouseData = !!(profile.spouse && (profile.spouse.firstName || profile.spouse.email));
  const sp = profile.spouse || emptySpouse;
  const updateSpouse = (field: string, value: string) => onChange({ ...profile, spouse: { ...sp, [field]: value } });

  const addressDisplay = profile.address
    ? [profile.address.street, profile.address.street2, profile.address.city, profile.address.state, profile.address.zipCode, profile.address.country].filter(Boolean).join(', ')
    : '';

  const spouseDisplayName = profile.spouse
    ? [profile.spouse.firstName, profile.spouse.lastName].filter(Boolean).join(' ')
    : '';

  const updateChild = (index: number, field: keyof ChildData, value: string) => {
    const updated = [...profile.children];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...profile, children: updated });
  };

  const addChild = () => {
    onChange({ ...profile, children: [...profile.children, { name: '', age: '' }] });
  };

  const removeChild = (index: number) => {
    onChange({ ...profile, children: profile.children.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Review Your Profile</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Please verify your details are up to date. Click &quot;Edit&quot; to make changes.
      </p>

      {/* Read-only Membership Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Membership</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Type</span>
            <span className="text-gray-900 dark:text-gray-100">{profile.membershipType || '—'}</span>
          </div>
          {profile.membershipLevel && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Level</span>
              <span className="text-gray-900 dark:text-gray-100">{profile.membershipLevel}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Status</span>
            <span className="text-gray-900 dark:text-gray-100">{profile.memberStatus || '—'}</span>
          </div>
        </div>
      </div>

      {/* Contact Details */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Contact Details</h4>
          <button
            type="button"
            onClick={() => setEditingSection(editingSection === 'contact' ? null : 'contact')}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
          >
            <HiOutlinePencil className="w-3 h-3" />
            {editingSection === 'contact' ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingSection === 'contact' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => onChange({ ...profile, phone: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Home Phone</label>
                <input
                  type="tel"
                  value={profile.homePhone}
                  onChange={(e) => onChange({ ...profile, homePhone: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Cell Phone</label>
                <input
                  type="tel"
                  value={profile.cellPhone}
                  onChange={(e) => onChange({ ...profile, cellPhone: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Street</label>
              <input
                type="text"
                value={profile.address?.street || ''}
                onChange={(e) => onChange({ ...profile, address: { ...(profile.address || { street: '', street2: '', city: '', state: '', zipCode: '', country: '' }), street: e.target.value } })}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">City</label>
                <input
                  type="text"
                  value={profile.address?.city || ''}
                  onChange={(e) => onChange({ ...profile, address: { ...(profile.address || { street: '', street2: '', city: '', state: '', zipCode: '', country: '' }), city: e.target.value } })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">State</label>
                <input
                  type="text"
                  value={profile.address?.state || ''}
                  onChange={(e) => onChange({ ...profile, address: { ...(profile.address || { street: '', street2: '', city: '', state: '', zipCode: '', country: '' }), state: e.target.value } })}
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">Qualifying Degree</label>
                <input
                  type="text"
                  value={profile.qualifyingDegree}
                  onChange={(e) => onChange({ ...profile, qualifyingDegree: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Native Place</label>
                <input
                  type="text"
                  value={profile.nativePlace}
                  onChange={(e) => onChange({ ...profile, nativePlace: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">College</label>
                <input
                  type="text"
                  value={profile.college}
                  onChange={(e) => onChange({ ...profile, college: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Employer</label>
                <input
                  type="text"
                  value={profile.employer}
                  onChange={(e) => onChange({ ...profile, employer: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">Job Title</label>
                <input
                  type="text"
                  value={profile.jobTitle}
                  onChange={(e) => onChange({ ...profile, jobTitle: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Special Interests</label>
                <input
                  type="text"
                  value={profile.specialInterests}
                  onChange={(e) => onChange({ ...profile, specialInterests: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Name</span>
              <span className="text-gray-900 dark:text-gray-100">{memberName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Phone</span>
              <span className="text-gray-900 dark:text-gray-100">{profile.phone || '—'}</span>
            </div>
            {profile.homePhone && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Home Phone</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.homePhone}</span>
              </div>
            )}
            {profile.cellPhone && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Cell Phone</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.cellPhone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Address</span>
              <span className="text-gray-900 dark:text-gray-100">{addressDisplay || '—'}</span>
            </div>
            {profile.qualifyingDegree && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Qualifying Degree</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.qualifyingDegree}</span>
              </div>
            )}
            {profile.nativePlace && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Native Place</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.nativePlace}</span>
              </div>
            )}
            {profile.college && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">College</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.college}</span>
              </div>
            )}
            {profile.employer && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Employer</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.employer}</span>
              </div>
            )}
            {profile.jobTitle && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Job Title</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.jobTitle}</span>
              </div>
            )}
            {profile.specialInterests && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Special Interests</span>
                <span className="text-gray-900 dark:text-gray-100">{profile.specialInterests}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spouse Details */}
      {(hasSpouseData || editingSection === 'spouse') && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Spouse Details</h4>
            <button
              type="button"
              onClick={() => setEditingSection(editingSection === 'spouse' ? null : 'spouse')}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
            >
              <HiOutlinePencil className="w-3 h-3" />
              {editingSection === 'spouse' ? 'Done' : 'Edit'}
            </button>
          </div>
          {editingSection === 'spouse' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="label">First Name</label>
                  <input type="text" value={sp.firstName} onChange={(e) => updateSpouse('firstName', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Middle Name</label>
                  <input type="text" value={sp.middleName} onChange={(e) => updateSpouse('middleName', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input type="text" value={sp.lastName} onChange={(e) => updateSpouse('lastName', e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">Spouse Email</label>
                  <input type="email" value={sp.email} onChange={(e) => updateSpouse('email', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Spouse Phone</label>
                  <input type="tel" value={sp.phone} onChange={(e) => updateSpouse('phone', e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">Native Place</label>
                  <input type="text" value={sp.nativePlace || ''} onChange={(e) => updateSpouse('nativePlace', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Company</label>
                  <input type="text" value={sp.company || ''} onChange={(e) => updateSpouse('company', e.target.value)} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">College</label>
                  <input type="text" value={sp.college || ''} onChange={(e) => updateSpouse('college', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Qualifying Degree</label>
                  <input type="text" value={sp.qualifyingDegree || ''} onChange={(e) => updateSpouse('qualifyingDegree', e.target.value)} className="input" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Name</span>
                <span className="text-gray-900 dark:text-gray-100">{spouseDisplayName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Email</span>
                <span className="text-gray-900 dark:text-gray-100">{sp.email || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Phone</span>
                <span className="text-gray-900 dark:text-gray-100">{sp.phone || '—'}</span>
              </div>
              {sp.nativePlace && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Native Place</span>
                  <span className="text-gray-900 dark:text-gray-100">{sp.nativePlace}</span>
                </div>
              )}
              {sp.company && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Company</span>
                  <span className="text-gray-900 dark:text-gray-100">{sp.company}</span>
                </div>
              )}
              {sp.college && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">College</span>
                  <span className="text-gray-900 dark:text-gray-100">{sp.college}</span>
                </div>
              )}
              {sp.qualifyingDegree && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Qualifying Degree</span>
                  <span className="text-gray-900 dark:text-gray-100">{sp.qualifyingDegree}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Spouse button when no spouse data exists */}
      {!hasSpouseData && editingSection !== 'spouse' && (
        <button
          type="button"
          onClick={() => setEditingSection('spouse')}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
        >
          <HiOutlinePlus className="w-3 h-3" />
          Add Spouse Details
        </button>
      )}

      {/* Children */}
      {(profile.children.length > 0 || editingSection === 'children') && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Children</h4>
            <button
              type="button"
              onClick={() => setEditingSection(editingSection === 'children' ? null : 'children')}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
            >
              <HiOutlinePencil className="w-3 h-3" />
              {editingSection === 'children' ? 'Done' : 'Edit'}
            </button>
          </div>
          {editingSection === 'children' ? (
            <div className="space-y-3">
              {profile.children.map((child, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="label">Name</label>
                    <input
                      type="text"
                      value={child.name}
                      onChange={(e) => updateChild(idx, 'name', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="w-20">
                    <label className="label">Age</label>
                    <input
                      type="text"
                      value={child.age}
                      onChange={(e) => updateChild(idx, 'age', e.target.value)}
                      className="input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeChild(idx)}
                    className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addChild}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                <HiOutlinePlus className="w-3 h-3" />
                Add Child
              </button>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {profile.children.map((child, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-gray-900 dark:text-gray-100">{child.name || '(no name)'}</span>
                  <span className="text-gray-500 dark:text-gray-400">{child.age ? `Age ${child.age}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Children button when no children exist */}
      {profile.children.length === 0 && editingSection !== 'children' && (
        <button
          type="button"
          onClick={() => {
            addChild();
            setEditingSection('children');
          }}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
        >
          <HiOutlinePlus className="w-3 h-3" />
          Add Children
        </button>
      )}

      {/* Read-only Payments */}
      {profile.payments && profile.payments.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payments</h4>
          <div className="space-y-2 text-sm">
            {profile.payments.map((payment, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-900 dark:text-gray-100">{payment.product || 'Payment'}</span>
                <span className="text-gray-500 dark:text-gray-400">{payment.amount ? `$${payment.amount}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Read-only Sponsor */}
      {profile.sponsors && profile.sponsors.length > 0 && profile.sponsors.some(s => s.name || s.email) && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sponsor</h4>
          <div className="space-y-1 text-sm">
            {profile.sponsors.filter(s => s.name || s.email).map((sponsor, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Name</span>
                  <span className="text-gray-900 dark:text-gray-100">{sponsor.name || '—'}</span>
                </div>
                {sponsor.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Email</span>
                    <span className="text-gray-900 dark:text-gray-100">{sponsor.email}</span>
                  </div>
                )}
                {sponsor.phone && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Phone</span>
                    <span className="text-gray-900 dark:text-gray-100">{sponsor.phone}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
