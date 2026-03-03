'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, validateNameRequired } from '@/lib/validation';
import { analytics } from '@/lib/analytics';
import FieldError from '@/components/ui/FieldError';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2';

interface MemberRecord {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  spouseName: string;
  spouseEmail: string;
  spousePhone: string;
  children: string;
  membershipType: string;
  membershipYears: string;
  registrationDate: string;
  renewalDate: string;
  status: string;
  notes: string;
}

interface ChildEntry {
  name: string;
  age: string;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: number[] = [];
for (let y = 2015; y <= currentYear + 1; y++) {
  YEAR_OPTIONS.push(y);
}

const emptyForm = {
  name: '',
  address: '',
  email: '',
  phone: '',
  spouseName: '',
  spouseEmail: '',
  spousePhone: '',
  children: [] as ChildEntry[],
  membershipType: 'Yearly' as 'Life Member' | 'Yearly',
  membershipYears: [] as string[],
  registrationDate: new Date().toISOString().split('T')[0],
  renewalDate: '',
  status: 'Active' as 'Active' | 'Not Renewed' | 'Expired',
  notes: '',
};

export default function MembersPage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('membershipType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/members?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch members');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, searchQuery]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (record: MemberRecord) => {
    setEditing(record);
    let children: ChildEntry[] = [];
    try {
      children = JSON.parse(record.children || '[]');
    } catch {
      children = [];
    }
    let membershipYears: string[] = [];
    if (record.membershipYears) {
      membershipYears = record.membershipYears.split(',').map((y) => y.trim()).filter(Boolean);
    }
    setForm({
      name: record.name,
      address: record.address,
      email: record.email,
      phone: record.phone,
      spouseName: record.spouseName,
      spouseEmail: record.spouseEmail,
      spousePhone: record.spousePhone,
      children,
      membershipType: record.membershipType as 'Life Member' | 'Yearly',
      membershipYears,
      registrationDate: record.registrationDate,
      renewalDate: record.renewalDate,
      status: record.status as 'Active' | 'Not Renewed' | 'Expired',
      notes: record.notes,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string | null> = {};
    errors.name = validateNameRequired(form.name);
    errors.email = validateEmail(form.email);
    errors.phone = validatePhone(form.phone);
    errors.spouseEmail = validateEmail(form.spouseEmail);
    errors.spousePhone = validatePhone(form.spousePhone);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        name: form.name,
        address: form.address,
        email: form.email,
        phone: form.phone,
        spouseName: form.spouseName,
        spouseEmail: form.spouseEmail,
        spousePhone: form.spousePhone,
        children: JSON.stringify(form.children),
        membershipType: form.membershipType,
        membershipYears: form.membershipYears.join(','),
        registrationDate: form.registrationDate,
        renewalDate: form.renewalDate,
        status: form.status,
        notes: form.notes,
      };
      const res = await fetch('/api/members', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        if (editing) {
          analytics.recordUpdated('member');
        } else {
          analytics.recordCreated('member');
        }
        toast.success(editing ? 'Member updated' : 'Member added');
        setModalOpen(false);
        fetchRecords();
      } else {
        toast.error(json.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this member?')) return;
    try {
      const res = await fetch(`/api/members?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        analytics.recordDeleted('member');
        toast.success('Deleted');
        fetchRecords();
      } else {
        toast.error(json.error || 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  // --- Children helpers ---
  const addChild = () => {
    setForm({ ...form, children: [...form.children, { name: '', age: '' }] });
  };

  const updateChild = (index: number, field: keyof ChildEntry, value: string) => {
    const updated = form.children.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    setForm({ ...form, children: updated });
  };

  const removeChild = (index: number) => {
    setForm({ ...form, children: form.children.filter((_, i) => i !== index) });
  };

  // --- Year toggle ---
  const toggleYear = (year: string) => {
    const years = form.membershipYears.includes(year)
      ? form.membershipYears.filter((y) => y !== year)
      : [...form.membershipYears, year];
    setForm({ ...form, membershipYears: years });
  };

  const columns: Column<MemberRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'phone', header: 'Phone', sortable: true },
    { key: 'spouseName', header: 'Spouse', sortable: true, filterable: true },
    { key: 'spouseEmail', header: 'Spouse Email', sortable: true, filterable: true },
    { key: 'membershipType', header: 'Type', sortable: true, filterable: true, filterOptions: ['Life Member', 'Yearly'] },
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Active', 'Not Renewed', 'Expired'], render: (item) => <StatusBadge status={item.status} /> },
    { key: 'renewalDate', header: 'Renewal Date', sortable: true, render: (item) => formatDate(item.renewalDate) },
    ...(isAdmin ? [{
      key: 'actions' as const,
      header: '',
      render: (item: MemberRecord) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(item); }}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded"
          >
            <HiOutlinePencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ),
    }] : []),
  ];

  const totalMembers = records.length;
  const activeMembers = records.filter((r) => r.status === 'Active').length;

  return (
    <>
      <PageHeader
        title="Members"
        description={`${totalMembers} total members | ${activeMembers} active`}
        action={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Member
            </button>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, email, phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="input w-full sm:w-64"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="select w-full sm:w-44"
        >
          <option value="">All Types</option>
          <option value="Life Member">Life Member</option>
          <option value="Yearly">Yearly</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="select w-full sm:w-44"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Not Renewed">Not Renewed</option>
          <option value="Expired">Expired</option>
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No members yet" />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Member' : 'Add Member'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Personal Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Personal Information</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((fe) => ({ ...fe, name: null })); }}
                  onBlur={() => setFieldErrors((fe) => ({ ...fe, name: validateNameRequired(form.name) }))}
                  className={`input ${fieldErrors.name ? 'border-red-500 dark:border-red-500' : ''}`}
                  required
                />
                <FieldError error={fieldErrors.name} />
              </div>
              <div>
                <label className="label">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((fe) => ({ ...fe, email: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, email: validateEmail(form.email) }))}
                    className={`input ${fieldErrors.email ? 'border-red-500 dark:border-red-500' : ''}`}
                  />
                  <FieldError error={fieldErrors.email} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors((fe) => ({ ...fe, phone: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, phone: validatePhone(form.phone) }))}
                    className={`input ${fieldErrors.phone ? 'border-red-500 dark:border-red-500' : ''}`}
                  />
                  <FieldError error={fieldErrors.phone} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Family Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Family Details</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Spouse Name</label>
                <input
                  type="text"
                  value={form.spouseName}
                  onChange={(e) => setForm({ ...form, spouseName: e.target.value })}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Spouse Email</label>
                  <input
                    type="email"
                    value={form.spouseEmail}
                    onChange={(e) => { setForm({ ...form, spouseEmail: e.target.value }); setFieldErrors((fe) => ({ ...fe, spouseEmail: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, spouseEmail: validateEmail(form.spouseEmail) }))}
                    className={`input ${fieldErrors.spouseEmail ? 'border-red-500 dark:border-red-500' : ''}`}
                  />
                  <FieldError error={fieldErrors.spouseEmail} />
                </div>
                <div>
                  <label className="label">Spouse Phone</label>
                  <input
                    type="tel"
                    value={form.spousePhone}
                    onChange={(e) => { setForm({ ...form, spousePhone: e.target.value }); setFieldErrors((fe) => ({ ...fe, spousePhone: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, spousePhone: validatePhone(form.spousePhone) }))}
                    className={`input ${fieldErrors.spousePhone ? 'border-red-500 dark:border-red-500' : ''}`}
                  />
                  <FieldError error={fieldErrors.spousePhone} />
                </div>
              </div>

              {/* Children */}
              <div>
                <label className="label">Children</label>
                <div className="space-y-2">
                  {form.children.map((child, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Name"
                        value={child.name}
                        onChange={(e) => updateChild(idx, 'name', e.target.value)}
                        className="input flex-1"
                      />
                      <input
                        type="text"
                        placeholder="Age"
                        value={child.age}
                        onChange={(e) => updateChild(idx, 'age', e.target.value)}
                        className="input w-20"
                      />
                      <button
                        type="button"
                        onClick={() => removeChild(idx)}
                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded"
                      >
                        <HiOutlineXMark className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addChild}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Add Child
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Membership */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Membership</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select
                    value={form.membershipType}
                    onChange={(e) => setForm({ ...form, membershipType: e.target.value as 'Life Member' | 'Yearly' })}
                    className="select"
                  >
                    <option value="Yearly">Yearly</option>
                    <option value="Life Member">Life Member</option>
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Not Renewed' | 'Expired' })}
                    className="select"
                  >
                    <option value="Active">Active</option>
                    <option value="Not Renewed">Not Renewed</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Registration Date</label>
                  <input
                    type="date"
                    value={form.registrationDate}
                    onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Renewal Date</label>
                  <input
                    type="date"
                    value={form.renewalDate}
                    onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {/* Membership Years */}
              <div>
                <label className="label">Membership Years</label>
                <div className="flex flex-wrap gap-2">
                  {YEAR_OPTIONS.map((year) => {
                    const yearStr = String(year);
                    const isSelected = form.membershipYears.includes(yearStr);
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => toggleYear(yearStr)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                          isSelected
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-primary-400'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Member'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
