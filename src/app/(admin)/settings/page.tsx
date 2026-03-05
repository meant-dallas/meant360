'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { validateUrl } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import { useYear } from '@/contexts/YearContext';
import {
  HiOutlineCog6Tooth,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineGlobeAlt,
  HiOutlineCreditCard,
  HiOutlineUserGroup,
  HiOutlineCalendarDays,
  HiOutlineEnvelope,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import { FaSquare, FaPaypal, FaCcVisa, FaCcMastercard, FaCcAmex } from 'react-icons/fa6';

export default function SettingsPage() {
  const { data: session } = useSession();
  const { year, setYear } = useYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const [testingSquare, setTestingSquare] = useState(false);
  const [testingPayPal, setTestingPayPal] = useState(false);
  const [squareStatus, setSquareStatus] = useState<boolean | null>(null);
  const [paypalStatus, setPaypalStatus] = useState<boolean | null>(null);

  // Sync transactions state
  const [syncing, setSyncing] = useState(false);
  const [syncSource, setSyncSource] = useState<'Square' | 'PayPal'>('Square');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Social media links state
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    facebook: '',
    linkedin: '',
    youtube: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [savingSocial, setSavingSocial] = useState(false);

  // Fee settings state
  const [feeSettings, setFeeSettings] = useState({
    squareFeePercent: '',
    squareFeeFixed: '',
    paypalFeePercent: '',
    paypalFeeFixed: '',
  });
  const [savingFees, setSavingFees] = useState(false);

  // Membership settings state
  const [membershipTypes, setMembershipTypes] = useState<{ name: string; price: string }[]>([]);
  const [requiredApprovals, setRequiredApprovals] = useState('3');
  const [savingMembership, setSavingMembership] = useState(false);

  // Email categories state
  const [emailCategories, setEmailCategories] = useState<{ name: string; email: string }[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);

  // Committee members state
  type CommitteeMember = { email: string; name: string; role: string; designation: string };
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [editingMember, setEditingMember] = useState<CommitteeMember | null>(null);
  const [newMember, setNewMember] = useState<CommitteeMember>({ email: '', name: '', role: 'committee', designation: '' });
  const [showAddMember, setShowAddMember] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [committeeErrors, setCommitteeErrors] = useState<Record<string, string | null>>({});

  // Load existing settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success && json.data) {
          const s = json.data as Record<string, string>;
          setSocialLinks({
            instagram: s['social_instagram'] || '',
            facebook: s['social_facebook'] || '',
            linkedin: s['social_linkedin'] || '',
            youtube: s['social_youtube'] || '',
          });
          setFeeSettings({
            squareFeePercent: s['fee_square_percent'] || '',
            squareFeeFixed: s['fee_square_fixed'] || '',
            paypalFeePercent: s['fee_paypal_percent'] || '',
            paypalFeeFixed: s['fee_paypal_fixed'] || '',
          });
          try {
            const types = JSON.parse(s['membership_types'] || '[]');
            if (Array.isArray(types) && types.length > 0) {
              setMembershipTypes(types.map((t: { name: string; price: number }) => ({ name: t.name, price: String(t.price) })));
            }
          } catch { /* ignore */ }
          setRequiredApprovals(s['membership_required_approvals'] || '3');
          try {
            const cats = JSON.parse(s['email_categories'] || '[]');
            if (Array.isArray(cats)) setEmailCategories(cats);
          } catch { /* ignore */ }
        }
      } catch {
        // Settings may not exist yet
      }
      try {
        const cRes = await fetch('/api/committee');
        const cJson = await cRes.json();
        if (cJson.success && cJson.data) setCommitteeMembers(cJson.data);
      } catch {
        // Committee data may not exist yet
      }
    })();
  }, []);

  const saveSocialLinks = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const errors: Record<string, string | null> = {};
    errors.instagram = validateUrl(socialLinks.instagram);
    errors.facebook = validateUrl(socialLinks.facebook);
    errors.linkedin = validateUrl(socialLinks.linkedin);
    errors.youtube = validateUrl(socialLinks.youtube);
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (Object.values(errors).some(Boolean)) return;
    setSavingSocial(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            social_instagram: socialLinks.instagram,
            social_facebook: socialLinks.facebook,
            social_linkedin: socialLinks.linkedin,
            social_youtube: socialLinks.youtube,
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Social media links saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save social media links');
    } finally {
      setSavingSocial(false);
    }
  };

  const saveFeeSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingFees(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            fee_square_percent: feeSettings.squareFeePercent,
            fee_square_fixed: feeSettings.squareFeeFixed,
            fee_paypal_percent: feeSettings.paypalFeePercent,
            fee_paypal_fixed: feeSettings.paypalFeeFixed,
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Credit card fee settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save fee settings');
    } finally {
      setSavingFees(false);
    }
  };

  const saveMembershipSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingMembership(true);
    try {
      const typesPayload = membershipTypes
        .filter((t) => t.name.trim())
        .map((t) => ({ name: t.name.trim(), price: parseFloat(t.price) || 0 }));
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            membership_types: JSON.stringify(typesPayload),
            membership_required_approvals: String(Math.max(1, parseInt(requiredApprovals, 10) || 3)),
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Membership settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save membership settings');
    } finally {
      setSavingMembership(false);
    }
  };

  const saveEmailCategories = async () => {
    setSavingCategories(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            email_categories: JSON.stringify(emailCategories.filter((c) => c.name || c.email)),
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Email categories saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save email categories');
    } finally {
      setSavingCategories(false);
    }
  };

  const addCommitteeMember = async () => {
    const errors: Record<string, string | null> = {};
    if (!newMember.name.trim()) errors.cm_name = 'Name is required';
    if (!newMember.email.trim()) errors.cm_email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMember.email)) errors.cm_email = 'Invalid email';
    setCommitteeErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSavingMember(true);
    try {
      const res = await fetch('/api/committee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });
      const json = await res.json();
      if (json.success) {
        setCommitteeMembers([...committeeMembers, json.data]);
        setNewMember({ email: '', name: '', role: 'committee', designation: '' });
        setShowAddMember(false);
        setCommitteeErrors({});
        toast.success('Committee member added');
      } else {
        toast.error(json.error || 'Failed to add member');
      }
    } catch {
      toast.error('Failed to add committee member');
    } finally {
      setSavingMember(false);
    }
  };

  const updateCommitteeMember = async () => {
    if (!editingMember) return;
    const errors: Record<string, string | null> = {};
    if (!editingMember.name.trim()) errors.edit_name = 'Name is required';
    setCommitteeErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSavingMember(true);
    try {
      const res = await fetch('/api/committee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMember),
      });
      const json = await res.json();
      if (json.success) {
        setCommitteeMembers(committeeMembers.map((m) => m.email === editingMember.email ? json.data : m));
        setEditingMember(null);
        setCommitteeErrors({});
        toast.success('Committee member updated');
      } else {
        toast.error(json.error || 'Failed to update member');
      }
    } catch {
      toast.error('Failed to update committee member');
    } finally {
      setSavingMember(false);
    }
  };

  const deleteCommitteeMember = async (email: string) => {
    if (!confirm('Are you sure you want to remove this committee member?')) return;
    try {
      const res = await fetch(`/api/committee?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setCommitteeMembers(committeeMembers.filter((m) => m.email !== email));
        toast.success('Committee member removed');
      } else {
        toast.error(json.error || 'Failed to remove member');
      }
    } catch {
      toast.error('Failed to remove committee member');
    }
  };

  const testConnection = async (source: 'square' | 'paypal') => {
    const setTesting = source === 'square' ? setTestingSquare : setTestingPayPal;
    const setStatus = source === 'square' ? setSquareStatus : setPaypalStatus;

    setTesting(true);
    try {
      // Attempt to sync 0 days to test the connection
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: source === 'square' ? 'Square' : 'PayPal',
          startDate: today,
          endDate: today,
        }),
      });
      const json = await res.json();
      setStatus(json.success);
      if (json.success) toast.success(`${source === 'square' ? 'Square' : 'PayPal'} connection successful`);
      else toast.error(`${source === 'square' ? 'Square' : 'PayPal'} connection failed: ${json.error}`);
    } catch {
      setStatus(false);
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: syncSource,
          startDate: syncStartDate,
          endDate: syncEndDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Synced ${json.data.imported} new transactions (${json.data.skipped} duplicates skipped)`);
        setShowSyncModal(false);
      } else {
        toast.error(json.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';

  return (
    <>
      <PageHeader title="Settings" description="Application configuration and integrations" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== Left Column: General & Organization ===== */}
        <div className="space-y-6">
          {/* User Info */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <HiOutlineCog6Tooth className="w-5 h-5" /> Account
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Name</span>
                <span className="font-medium">{session?.user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Email</span>
                <span className="font-medium">{session?.user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Role</span>
                <span className="font-medium capitalize">{role}</span>
              </div>
            </div>
          </div>

          {/* Committee Members */}
        {isAdmin && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <HiOutlineShieldCheck className="w-5 h-5" /> Committee Members
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Manage committee members who have access to the admin dashboard. Only admins can add or remove members.
            </p>

            {/* Existing members list */}
            <div className="space-y-2 mb-4">
              {committeeMembers.map((member) => (
                <div key={member.email} className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {editingMember?.email === member.email ? (
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={editingMember.name}
                            onChange={(e) => { setEditingMember({ ...editingMember, name: e.target.value }); setCommitteeErrors((fe) => ({ ...fe, edit_name: null })); }}
                            className={`input ${committeeErrors.edit_name ? 'border-red-500 dark:border-red-500' : ''}`}
                            placeholder="Name"
                          />
                          <FieldError error={committeeErrors.edit_name} />
                        </div>
                        <input
                          type="text"
                          value={editingMember.designation}
                          onChange={(e) => setEditingMember({ ...editingMember, designation: e.target.value })}
                          className="input"
                          placeholder="Designation (e.g. President)"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={editingMember.role}
                          onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                          className="select"
                        >
                          <option value="admin">Admin</option>
                          <option value="committee">Committee</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={updateCommitteeMember} disabled={savingMember} className="btn-primary text-sm">
                          {savingMember ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingMember(null); setCommitteeErrors({}); }} className="btn-secondary text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{member.name || member.email}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
                            {member.role}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                        {member.designation && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">{member.designation}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingMember({ ...member })}
                          className="p-2 text-gray-400 hover:text-blue-600 rounded"
                          title="Edit"
                        >
                          <HiOutlinePencilSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCommitteeMember(member.email)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded"
                          title="Remove"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {committeeMembers.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">No committee members yet.</p>
              )}
            </div>

            {/* Add new member form */}
            {showAddMember ? (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name *</label>
                    <input
                      type="text"
                      value={newMember.name}
                      onChange={(e) => { setNewMember({ ...newMember, name: e.target.value }); setCommitteeErrors((fe) => ({ ...fe, cm_name: null })); }}
                      className={`input ${committeeErrors.cm_name ? 'border-red-500 dark:border-red-500' : ''}`}
                      placeholder="Full name"
                    />
                    <FieldError error={committeeErrors.cm_name} />
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <input
                      type="email"
                      value={newMember.email}
                      onChange={(e) => { setNewMember({ ...newMember, email: e.target.value }); setCommitteeErrors((fe) => ({ ...fe, cm_email: null })); }}
                      className={`input ${committeeErrors.cm_email ? 'border-red-500 dark:border-red-500' : ''}`}
                      placeholder="email@example.com"
                    />
                    <FieldError error={committeeErrors.cm_email} />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <select
                      value={newMember.role}
                      onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                      className="select"
                    >
                      <option value="admin">Admin</option>
                      <option value="committee">Committee</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Designation</label>
                    <input
                      type="text"
                      value={newMember.designation}
                      onChange={(e) => setNewMember({ ...newMember, designation: e.target.value })}
                      className="input"
                      placeholder="e.g. President, Treasurer"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addCommitteeMember} disabled={savingMember} className="btn-primary text-sm">
                    {savingMember ? 'Adding...' : 'Add Member'}
                  </button>
                  <button onClick={() => { setShowAddMember(false); setCommitteeErrors({}); }} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddMember(true)}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <HiOutlinePlus className="w-4 h-4" /> Add Committee Member
              </button>
            )}
          </div>
        )}

        {/* Data Year */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCalendarDays className="w-5 h-5" /> Data Year
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select the active year for all financial data, events, and reports displayed across the application.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="select w-32"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setYear(selectedYear);
                toast.success(`Active year set to ${selectedYear}`);
              }}
              disabled={selectedYear === year}
              className="btn-primary"
            >
              Apply
            </button>
            {selectedYear === year && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Current</span>
            )}
          </div>
        </div>

          {/* Membership Settings */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <HiOutlineUserGroup className="w-5 h-5" /> Membership
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Set the yearly membership cost and approval requirements for new member applications.
            </p>
            <form onSubmit={saveMembershipSettings} className="space-y-4">
              <div>
                <label className="label">Membership Types</label>
                <div className="space-y-2">
                  {membershipTypes.map((mt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mt.name}
                        onChange={(e) => {
                          const updated = [...membershipTypes];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setMembershipTypes(updated);
                        }}
                        className="input flex-1"
                        placeholder="Type name"
                        disabled={!isAdmin}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mt.price}
                        onChange={(e) => {
                          const updated = [...membershipTypes];
                          updated[i] = { ...updated[i], price: e.target.value };
                          setMembershipTypes(updated);
                        }}
                        className="input w-28"
                        placeholder="Price"
                        disabled={!isAdmin}
                      />
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setMembershipTypes(membershipTypes.filter((_, j) => j !== i))}
                          className="p-2 text-gray-400 hover:text-red-600 rounded"
                          title="Remove"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setMembershipTypes([...membershipTypes, { name: '', price: '' }])}
                      className="btn-secondary text-sm flex items-center gap-1"
                    >
                      <HiOutlinePlus className="w-4 h-4" /> Add Type
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Required BoD Approvals for New Applications</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={requiredApprovals}
                  onChange={(e) => setRequiredApprovals(e.target.value)}
                  className="input"
                  placeholder="3"
                  disabled={!isAdmin}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Number of Board of Directors approvals needed before a membership application is approved (minimum 1).
                </p>
              </div>
              {isAdmin && (
                <button type="submit" disabled={savingMembership} className="btn-primary">
                  {savingMembership ? 'Saving...' : 'Save Membership Settings'}
                </button>
              )}
            </form>
          </div>
        </div>

        {/* ===== Right Column: Configuration & Integrations ===== */}
        <div className="space-y-6">
        {/* Social Media Links */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineGlobeAlt className="w-5 h-5" /> Social Media Links
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            URLs shown as QR codes on the event home page so attendees can follow your accounts.
          </p>
          <form onSubmit={saveSocialLinks} className="space-y-3">
            <div>
              <label className="label">Instagram URL</label>
              <input
                type="url"
                value={socialLinks.instagram}
                onChange={(e) => { setSocialLinks({ ...socialLinks, instagram: e.target.value }); setFieldErrors((fe) => ({ ...fe, instagram: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, instagram: validateUrl(socialLinks.instagram) }))}
                className={`input ${fieldErrors.instagram ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://instagram.com/yourorg"
                disabled={!isAdmin}
              />
              <FieldError error={fieldErrors.instagram} />
            </div>
            <div>
              <label className="label">Facebook URL</label>
              <input
                type="url"
                value={socialLinks.facebook}
                onChange={(e) => { setSocialLinks({ ...socialLinks, facebook: e.target.value }); setFieldErrors((fe) => ({ ...fe, facebook: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, facebook: validateUrl(socialLinks.facebook) }))}
                className={`input ${fieldErrors.facebook ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://facebook.com/yourorg"
                disabled={!isAdmin}
              />
              <FieldError error={fieldErrors.facebook} />
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input
                type="url"
                value={socialLinks.linkedin}
                onChange={(e) => { setSocialLinks({ ...socialLinks, linkedin: e.target.value }); setFieldErrors((fe) => ({ ...fe, linkedin: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, linkedin: validateUrl(socialLinks.linkedin) }))}
                className={`input ${fieldErrors.linkedin ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://linkedin.com/company/yourorg"
                disabled={!isAdmin}
              />
              <FieldError error={fieldErrors.linkedin} />
            </div>
            <div>
              <label className="label">YouTube URL</label>
              <input
                type="url"
                value={socialLinks.youtube}
                onChange={(e) => { setSocialLinks({ ...socialLinks, youtube: e.target.value }); setFieldErrors((fe) => ({ ...fe, youtube: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, youtube: validateUrl(socialLinks.youtube) }))}
                className={`input ${fieldErrors.youtube ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://youtube.com/@yourorg"
                disabled={!isAdmin}
              />
              <FieldError error={fieldErrors.youtube} />
            </div>
            {isAdmin && (
              <button type="submit" disabled={savingSocial} className="btn-primary">
                {savingSocial ? 'Saving...' : 'Save Social Links'}
              </button>
            )}
          </form>
        </div>

        {/* Email Categories */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineEnvelope className="w-5 h-5" /> Email Categories
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Define email categories with associated Gmail addresses. These are used as &quot;From&quot; addresses when composing emails and for tagging events.
          </p>
          <div className="space-y-3">
            {emailCategories.map((cat, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={cat.name}
                  onChange={(e) => {
                    const updated = [...emailCategories];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setEmailCategories(updated);
                  }}
                  className="input flex-1"
                  placeholder="Category name"
                  disabled={!isAdmin}
                />
                <input
                  type="email"
                  value={cat.email}
                  onChange={(e) => {
                    const updated = [...emailCategories];
                    updated[i] = { ...updated[i], email: e.target.value };
                    setEmailCategories(updated);
                  }}
                  className="input flex-1"
                  placeholder="email@example.com"
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setEmailCategories(emailCategories.filter((_, j) => j !== i))}
                    className="p-2 text-gray-400 hover:text-red-600 rounded"
                    title="Remove"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEmailCategories([...emailCategories, { name: '', email: '' }])}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <HiOutlinePlus className="w-4 h-4" /> Add Category
              </button>
            )}
            {isAdmin && (
              <button onClick={saveEmailCategories} disabled={savingCategories} className="btn-primary">
                {savingCategories ? 'Saving...' : 'Save Email Categories'}
              </button>
            )}
          </div>
        </div>

        {/* Credit Card Fees */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCreditCard className="w-5 h-5" /> Credit Card Processing Fees
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Set the processing fee rates per payment method. Fees are shown to the customer during payment so they cover the processing cost.
          </p>
          <form onSubmit={saveFeeSettings} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaSquare className="w-3.5 h-3.5" /> Square (Card)
                <span className="inline-flex items-center gap-1 ml-auto">
                  <FaCcVisa className="w-5 h-3.5 text-blue-400" />
                  <FaCcMastercard className="w-5 h-3.5 text-orange-400" />
                  <FaCcAmex className="w-5 h-3.5 text-blue-300" />
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fee %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.squareFeePercent}
                    onChange={(e) => setFeeSettings({ ...feeSettings, squareFeePercent: e.target.value })}
                    className="input"
                    placeholder="2.9"
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="label">Fixed Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.squareFeeFixed}
                    onChange={(e) => setFeeSettings({ ...feeSettings, squareFeeFixed: e.target.value })}
                    className="input"
                    placeholder="0.30"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaPaypal className="w-3.5 h-3.5 text-[#00457C]" /> PayPal
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fee %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.paypalFeePercent}
                    onChange={(e) => setFeeSettings({ ...feeSettings, paypalFeePercent: e.target.value })}
                    className="input"
                    placeholder="3.49"
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="label">Fixed Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.paypalFeeFixed}
                    onChange={(e) => setFeeSettings({ ...feeSettings, paypalFeeFixed: e.target.value })}
                    className="input"
                    placeholder="0.49"
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>
            {isAdmin && (
              <button type="submit" disabled={savingFees} className="btn-primary">
                {savingFees ? 'Saving...' : 'Save Fee Settings'}
              </button>
            )}
          </form>
        </div>

        {/* Integration Status */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineArrowPath className="w-5 h-5" /> Payment Integrations
          </h3>

          <div className="space-y-4">
            {/* Square */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
                  <FaSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">Square</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Transaction sync (read-only)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {squareStatus !== null && (
                  squareStatus ? (
                    <HiOutlineCheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <HiOutlineXCircle className="w-5 h-5 text-red-500" />
                  )
                )}
                {isAdmin && (
                  <button
                    onClick={() => testConnection('square')}
                    disabled={testingSquare}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingSquare ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </div>

            {/* PayPal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#003087] rounded-lg flex items-center justify-center flex-shrink-0">
                  <FaPaypal className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">PayPal</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Transaction sync (read-only)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {paypalStatus !== null && (
                  paypalStatus ? (
                    <HiOutlineCheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <HiOutlineXCircle className="w-5 h-5 text-red-500" />
                  )
                )}
                {isAdmin && (
                  <button
                    onClick={() => testConnection('paypal')}
                    disabled={testingPayPal}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingPayPal ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sync Transactions */}
        {isAdmin && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <HiOutlineArrowPath className="w-5 h-5" /> Sync Transactions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Import transactions from Square or PayPal. Duplicate transactions are automatically skipped.
            </p>
            <button onClick={() => setShowSyncModal(true)} className="btn-primary flex items-center gap-2">
              <HiOutlineArrowPath className="w-4 h-4" /> Sync Transactions
            </button>
          </div>
        )}

        </div>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSyncModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Sync Transactions</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Source</label>
                <select value={syncSource} onChange={(e) => setSyncSource(e.target.value as 'Square' | 'PayPal')} className="select">
                  <option value="Square">Square</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={syncStartDate} onChange={(e) => setSyncStartDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={syncEndDate} onChange={(e) => setSyncEndDate(e.target.value)} className="input" />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Duplicate transactions will be automatically skipped based on transaction ID.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSyncModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
                  {syncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <HiOutlineArrowPath className="w-4 h-4" /> Sync Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
