'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';
import { validatePhone, validateEmail } from '@/lib/validation';
import toast from 'react-hot-toast';
import { analytics } from '@/lib/analytics';
import {
  HiOutlinePencilSquare,
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlineTrash,
} from 'react-icons/hi2';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  spouseName: string;
  spouseEmail: string;
  spousePhone: string;
  children: string;
  membershipType: string;
  membershipYears: string;
  registrationDate: string;
  renewalDate: string;
  status: string;
}

interface Child {
  name: string;
  age: string;
}

type EditSection = 'contact' | 'spouse' | 'children' | null;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function MemberProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>(null);

  // Editable form state
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [spousePhone, setSpousePhone] = useState('');
  const [children, setChildren] = useState<Child[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/profile');
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
        setPhone(json.data.phone || '');
        setAddress(json.data.address || '');
        setSpouseName(json.data.spouseName || '');
        setSpouseEmail(json.data.spouseEmail || '');
        setSpousePhone(json.data.spousePhone || '');
        try {
          const parsed = JSON.parse(json.data.children || '[]');
          setChildren(Array.isArray(parsed) ? parsed : []);
        } catch {
          setChildren([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const startEdit = (section: EditSection) => {
    if (!profile) return;
    // Reset form to current profile values when starting edit
    setPhone(profile.phone || '');
    setAddress(profile.address || '');
    setSpouseName(profile.spouseName || '');
    setSpouseEmail(profile.spouseEmail || '');
    setSpousePhone(profile.spousePhone || '');
    try {
      const parsed = JSON.parse(profile.children || '[]');
      setChildren(Array.isArray(parsed) ? parsed : []);
    } catch {
      setChildren([]);
    }
    setFieldErrors({});
    setEditSection(section);
  };

  const cancelEdit = () => {
    setEditSection(null);
    setFieldErrors({});
  };

  const saveSection = async (section: EditSection) => {
    if (!section) return;

    // Validate
    const errors: Record<string, string | null> = {};
    if (section === 'contact') {
      errors.phone = phone ? validatePhone(phone) : null;
    } else if (section === 'spouse') {
      errors.spouseEmail = spouseEmail ? validateEmail(spouseEmail) : null;
      errors.spousePhone = spousePhone ? validatePhone(spousePhone) : null;
    }

    setFieldErrors(errors);
    if (Object.values(errors).some((e) => e)) return;

    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (section === 'contact') {
        payload.phone = phone;
        payload.address = address;
      } else if (section === 'spouse') {
        payload.spouseName = spouseName;
        payload.spouseEmail = spouseEmail;
        payload.spousePhone = spousePhone;
      } else if (section === 'children') {
        payload.children = JSON.stringify(children.filter((c) => c.name.trim()));
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

  const parsedChildren: Child[] = (() => {
    try { return JSON.parse(profile.children || '[]'); } catch { return []; }
  })();

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Profile</h1>
      </motion.div>

      {/* Read-only membership info */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Membership
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Name</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Type</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.membershipType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Status</p>
              <StatusBadge status={profile.status} />
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Years</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.membershipYears || '—'}</p>
            </div>
            {profile.renewalDate && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Renewal Date</p>
                <p className="text-gray-900 dark:text-gray-100">{formatDate(profile.renewalDate)}</p>
              </div>
            )}
          </div>
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
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input w-full" />
                {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="input w-full" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Address</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.address || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Spouse section */}
      <motion.div variants={itemVariants}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Spouse
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
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                <input type="text" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
                <input type="email" value={spouseEmail} onChange={(e) => setSpouseEmail(e.target.value)} className="input w-full" />
                {fieldErrors.spouseEmail && <p className="text-xs text-red-500 mt-1">{fieldErrors.spouseEmail}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                <input type="tel" value={spousePhone} onChange={(e) => setSpousePhone(e.target.value)} className="input w-full" />
                {fieldErrors.spousePhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.spousePhone}</p>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Name</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.spouseName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Email</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.spouseEmail || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                <p className="text-gray-900 dark:text-gray-100">{profile.spousePhone || '—'}</p>
              </div>
            </div>
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
                      const updated = [...children];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setChildren(updated);
                    }}
                    className="input flex-1"
                  />
                  <input
                    type="text"
                    placeholder="Age"
                    value={child.age}
                    onChange={(e) => {
                      const updated = [...children];
                      updated[index] = { ...updated[index], age: e.target.value };
                      setChildren(updated);
                    }}
                    className="input w-20"
                  />
                  <button
                    onClick={() => setChildren(children.filter((_, i) => i !== index))}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setChildren([...children, { name: '', age: '' }])}
                className="text-primary-600 dark:text-primary-400 text-sm flex items-center gap-1 hover:underline"
              >
                <HiOutlinePlus className="w-4 h-4" /> Add Child
              </button>
            </div>
          ) : parsedChildren.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No children added.</p>
          ) : (
            <div className="space-y-2">
              {parsedChildren.map((child, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-900 dark:text-gray-100">{child.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{child.age ? `Age ${child.age}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
