'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, formatPhone, stripPhone, calculateAge } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, validateNameRequired } from '@/lib/validation';
import { analytics } from '@/lib/analytics';
import FieldError from '@/components/ui/FieldError';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2';

interface MemberRecord {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  homePhone: string;
  cellPhone: string;
  spouseName: string;
  spouseFirstName: string;
  spouseMiddleName: string;
  spouseLastName: string;
  spouseEmail: string;
  spousePhone: string;
  spouseNativePlace: string;
  spouseCompany: string;
  spouseCollege: string;
  spouseQualifyingDegree: string;
  children: string;
  membershipType: string;
  membershipLevel: string;
  membershipYears: string;
  registrationDate: string;
  renewalDate: string;
  status: string;
  notes: string;
  qualifyingDegree: string;
  nativePlace: string;
  college: string;
  jobTitle: string;
  employer: string;
  specialInterests: string;
  payments: string;
  sponsors: string;
}

interface ChildEntry {
  name: string;
  age: string;
  sex: string;
  grade: string;
  dateOfBirth: string;
}

interface PaymentEntry {
  product: string;
  amount: string;
  payerName: string;
  payerEmail: string;
  transactionId: string;
}

interface SponsorEntry {
  name: string;
  email: string;
  phone: string;
}

interface MembershipYearEntry {
  year: string;
  status: string;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: number[] = [];
for (let y = 2015; y <= currentYear + 1; y++) {
  YEAR_OPTIONS.push(y);
}

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  homePhone: '',
  cellPhone: '',
  qualifyingDegree: '',
  nativePlace: '',
  college: '',
  jobTitle: '',
  employer: '',
  specialInterests: '',
  // Address
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  // Spouse
  spouseFirstName: '',
  spouseMiddleName: '',
  spouseLastName: '',
  spouseEmail: '',
  spousePhone: '',
  spouseNativePlace: '',
  spouseCompany: '',
  spouseCollege: '',
  spouseQualifyingDegree: '',
  // Children
  children: [] as ChildEntry[],
  // Payments
  payments: [] as PaymentEntry[],
  // Sponsor
  sponsor: { name: '', email: '', phone: '' } as SponsorEntry,
  // Membership
  membershipType: 'Yearly' as 'Life Member' | 'Yearly',
  membershipLevel: '' as '' | 'Family' | 'Individual',
  membershipYears: [] as MembershipYearEntry[],
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
      const parsed = JSON.parse(record.children || '[]');
      children = parsed.map((c: Record<string, string>) => ({
        name: c.name || '',
        age: c.dateOfBirth ? calculateAge(c.dateOfBirth) : (c.age || ''),
        sex: c.sex || '',
        grade: c.grade || '',
        dateOfBirth: c.dateOfBirth || '',
      }));
    } catch {
      children = [];
    }

    // Parse membership years from CSV to structured array
    let membershipYears: MembershipYearEntry[] = [];
    if (record.membershipYears) {
      membershipYears = record.membershipYears.split(',').map((y) => y.trim()).filter(Boolean).map(y => ({
        year: y,
        status: 'Active',
      }));
    }

    // Parse payments
    let payments: PaymentEntry[] = [];
    try {
      payments = JSON.parse(record.payments || '[]');
    } catch {
      payments = [];
    }

    // Parse sponsor (first entry from sponsors array)
    let sponsor: SponsorEntry = { name: '', email: '', phone: '' };
    try {
      const sponsorsArr = JSON.parse(record.sponsors || '[]');
      if (sponsorsArr.length > 0) {
        sponsor = { name: sponsorsArr[0].name || '', email: sponsorsArr[0].email || '', phone: sponsorsArr[0].phone || '' };
      }
    } catch {
      // keep default
    }

    // Parse address from flat string (best effort)
    const addressParts = (record.address || '').split(',').map(s => s.trim());

    setForm({
      firstName: record.firstName || '',
      middleName: record.middleName || '',
      lastName: record.lastName || '',
      email: record.email,
      phone: record.phone,
      homePhone: record.homePhone || '',
      cellPhone: record.cellPhone || '',
      qualifyingDegree: record.qualifyingDegree || '',
      nativePlace: record.nativePlace || '',
      college: record.college || '',
      jobTitle: record.jobTitle || '',
      employer: record.employer || '',
      specialInterests: record.specialInterests || '',
      // Parse address - use first part as street, rest as city/state/zip
      street: addressParts[0] || '',
      street2: addressParts[1] || '',
      city: addressParts[2] || '',
      state: addressParts[3] || '',
      zipCode: addressParts[4] || '',
      country: addressParts[5] || '',
      // Spouse fields from record
      spouseFirstName: record.spouseFirstName || '',
      spouseMiddleName: record.spouseMiddleName || '',
      spouseLastName: record.spouseLastName || '',
      spouseEmail: record.spouseEmail || '',
      spousePhone: record.spousePhone || '',
      spouseNativePlace: record.spouseNativePlace || '',
      spouseCompany: record.spouseCompany || '',
      spouseCollege: record.spouseCollege || '',
      spouseQualifyingDegree: record.spouseQualifyingDegree || '',
      children,
      payments,
      sponsor,
      membershipType: record.membershipType as 'Life Member' | 'Yearly',
      membershipLevel: (record.membershipLevel || '') as '' | 'Family' | 'Individual',
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
    errors.firstName = validateNameRequired(form.firstName);
    errors.lastName = validateNameRequired(form.lastName);
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
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        email: form.email,
        phone: stripPhone(form.phone),
        homePhone: stripPhone(form.homePhone),
        cellPhone: stripPhone(form.cellPhone),
        qualifyingDegree: form.qualifyingDegree,
        nativePlace: form.nativePlace,
        college: form.college,
        jobTitle: form.jobTitle,
        employer: form.employer,
        specialInterests: form.specialInterests,
        membershipType: form.membershipType,
        membershipLevel: form.membershipLevel,
        registrationDate: form.registrationDate,
        renewalDate: form.renewalDate,
        status: form.status,
        notes: form.notes,
        address: {
          street: form.street,
          street2: form.street2,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
          country: form.country,
        },
        spouse: {
          firstName: form.spouseFirstName,
          middleName: form.spouseMiddleName,
          lastName: form.spouseLastName,
          email: form.spouseEmail,
          phone: stripPhone(form.spousePhone),
          nativePlace: form.spouseNativePlace,
          company: form.spouseCompany,
          college: form.spouseCollege,
          qualifyingDegree: form.spouseQualifyingDegree,
        },
        children: form.children.filter(c => c.name.trim()),
        payments: form.payments.filter(p => p.product.trim() || p.amount.trim()),
        sponsor: { ...form.sponsor, phone: stripPhone(form.sponsor.phone) },
        membershipYears: form.membershipYears,
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
    setForm({ ...form, children: [...form.children, { name: '', age: '', sex: '', grade: '', dateOfBirth: '' }] });
  };

  const updateChild = (index: number, field: keyof ChildEntry, value: string) => {
    const updated = form.children.map((c, i) => {
      if (i !== index) return c;
      const changes: Partial<ChildEntry> = { [field]: value };
      if (field === 'dateOfBirth') {
        changes.age = calculateAge(value);
      }
      return { ...c, ...changes };
    });
    setForm({ ...form, children: updated });
  };

  const removeChild = (index: number) => {
    setForm({ ...form, children: form.children.filter((_, i) => i !== index) });
  };

  // --- Payment helpers ---
  const addPayment = () => {
    setForm({ ...form, payments: [...form.payments, { product: '', amount: '', payerName: '', payerEmail: '', transactionId: '' }] });
  };

  const updatePayment = (index: number, field: keyof PaymentEntry, value: string) => {
    const updated = form.payments.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    setForm({ ...form, payments: updated });
  };

  const removePayment = (index: number) => {
    setForm({ ...form, payments: form.payments.filter((_, i) => i !== index) });
  };

  // --- Year toggle ---
  const toggleYear = (year: string) => {
    const exists = form.membershipYears.find(my => my.year === year);
    if (exists) {
      setForm({ ...form, membershipYears: form.membershipYears.filter((my) => my.year !== year) });
    } else {
      setForm({ ...form, membershipYears: [...form.membershipYears, { year, status: 'Active' }] });
    }
  };

  const columns: Column<MemberRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (item) => `${item.firstName} ${item.lastName}`.trim() || item.name,
    },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'phone', header: 'Phone', sortable: true, render: (item) => formatPhone(item.phone) },
    { key: 'spouseName', header: 'Spouse', sortable: true, filterable: true },
    { key: 'spouseEmail', header: 'Spouse Email', sortable: true, filterable: true },
    { key: 'membershipType', header: 'Type', sortable: true, filterable: true, filterOptions: ['Life Member', 'Yearly'] },
    { key: 'membershipLevel', header: 'Level', sortable: true, filterable: true, filterOptions: ['Family', 'Individual'] },
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Active', 'Not Renewed', 'Expired'], render: (item) => <StatusBadge status={item.status} /> },
    { key: 'renewalDate', header: 'Renewal Date', sortable: true, render: (item) => formatDate(item.renewalDate) },
    {
      key: 'membershipYears',
      header: 'Last Renewed',
      sortable: true,
      sortFn: (a, b) => {
        const getMax = (csv: string) => {
          if (!csv) return 0;
          const years = csv.split(',').map(y => parseInt(y.trim(), 10)).filter(Boolean);
          return years.length ? Math.max(...years) : 0;
        };
        return getMax(a.membershipYears) - getMax(b.membershipYears);
      },
      render: (item) => {
        if (!item.membershipYears) return '';
        const years = item.membershipYears.split(',').map(y => parseInt(y.trim(), 10)).filter(Boolean);
        return years.length ? String(Math.max(...years)) : '';
      },
    },
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
          placeholder="Search name, email, phone, spouse phone..."
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">First Name *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setFieldErrors((fe) => ({ ...fe, firstName: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, firstName: validateNameRequired(form.firstName) }))}
                    className={`input ${fieldErrors.firstName ? 'border-red-500 dark:border-red-500' : ''}`}
                    required
                  />
                  <FieldError error={fieldErrors.firstName} />
                </div>
                <div>
                  <label className="label">Middle Name</label>
                  <input
                    type="text"
                    value={form.middleName}
                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => { setForm({ ...form, lastName: e.target.value }); setFieldErrors((fe) => ({ ...fe, lastName: null })); }}
                    onBlur={() => setFieldErrors((fe) => ({ ...fe, lastName: validateNameRequired(form.lastName) }))}
                    className={`input ${fieldErrors.lastName ? 'border-red-500 dark:border-red-500' : ''}`}
                    required
                  />
                  <FieldError error={fieldErrors.lastName} />
                </div>
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

          {/* Section 2: Address */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Address</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Street</label>
                <input type="text" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Street 2</label>
                <input type="text" value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="label">City</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">State</label>
                  <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Zip Code</label>
                  <input type="text" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Family Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Spouse Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">First Name</label>
                  <input type="text" value={form.spouseFirstName} onChange={(e) => setForm({ ...form, spouseFirstName: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Middle Name</label>
                  <input type="text" value={form.spouseMiddleName} onChange={(e) => setForm({ ...form, spouseMiddleName: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input type="text" value={form.spouseLastName} onChange={(e) => setForm({ ...form, spouseLastName: e.target.value })} className="input" />
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Native Place</label>
                  <input type="text" value={form.spouseNativePlace} onChange={(e) => setForm({ ...form, spouseNativePlace: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Company</label>
                  <input type="text" value={form.spouseCompany} onChange={(e) => setForm({ ...form, spouseCompany: e.target.value })} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">College</label>
                  <input type="text" value={form.spouseCollege} onChange={(e) => setForm({ ...form, spouseCollege: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Qualifying Degree</label>
                  <input type="text" value={form.spouseQualifyingDegree} onChange={(e) => setForm({ ...form, spouseQualifyingDegree: e.target.value })} className="input" />
                </div>
              </div>
            </div>
          </div>

          {/* Children */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Children</h3>
            <div className="space-y-2">
              {form.children.map((child, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="text" placeholder="Name" value={child.name} onChange={(e) => updateChild(idx, 'name', e.target.value)} className="input flex-1" />
                  <input type="text" value={child.dateOfBirth ? calculateAge(child.dateOfBirth) : child.age} disabled className="input w-16 !bg-gray-100 dark:!bg-gray-700 cursor-not-allowed" />
                  <select value={child.sex} onChange={(e) => updateChild(idx, 'sex', e.target.value)} className="select w-20">
                    <option value="">Sex</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                  <input type="text" placeholder="Grade" value={child.grade} onChange={(e) => updateChild(idx, 'grade', e.target.value)} className="input w-20" />
                  <input type="month" value={child.dateOfBirth?.slice(0, 7)} onChange={(e) => updateChild(idx, 'dateOfBirth', e.target.value)} placeholder="MMM/YYYY" className="input w-36" />
                  <button type="button" onClick={() => removeChild(idx)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded">
                    <HiOutlineXMark className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addChild} className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium">
              + Add Child
            </button>
          </div>

          {/* Section 4: Membership */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Membership</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <label className="label">Level</label>
                  <select
                    value={form.membershipLevel}
                    onChange={(e) => setForm({ ...form, membershipLevel: e.target.value as '' | 'Family' | 'Individual' })}
                    className="select"
                  >
                    <option value="">—</option>
                    <option value="Family">Family</option>
                    <option value="Individual">Individual</option>
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
                    const isSelected = form.membershipYears.some(my => my.year === yearStr);
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

          {/* Section 5: Payments */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Payments</h3>
            <div className="space-y-2">
              {form.payments.map((payment, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="text" placeholder="Product" value={payment.product} onChange={(e) => updatePayment(idx, 'product', e.target.value)} className="input flex-1" />
                  <input type="text" placeholder="Amount" value={payment.amount} onChange={(e) => updatePayment(idx, 'amount', e.target.value)} className="input w-24" />
                  <input type="text" placeholder="Payer Name" value={payment.payerName} onChange={(e) => updatePayment(idx, 'payerName', e.target.value)} className="input flex-1" />
                  <input type="text" placeholder="Payer Email" value={payment.payerEmail} onChange={(e) => updatePayment(idx, 'payerEmail', e.target.value)} className="input flex-1" />
                  <input type="text" placeholder="Transaction ID" value={payment.transactionId} onChange={(e) => updatePayment(idx, 'transactionId', e.target.value)} className="input w-32" />
                  <button type="button" onClick={() => removePayment(idx)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded">
                    <HiOutlineXMark className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addPayment} className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium">
              + Add Payment
            </button>
          </div>

          {/* Section 6: Sponsor */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Sponsor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Name</label>
                <input type="text" value={form.sponsor.name} onChange={(e) => setForm({ ...form, sponsor: { ...form.sponsor, name: e.target.value } })} className="input" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={form.sponsor.email} onChange={(e) => setForm({ ...form, sponsor: { ...form.sponsor, email: e.target.value } })} className="input" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" value={form.sponsor.phone} onChange={(e) => setForm({ ...form, sponsor: { ...form.sponsor, phone: e.target.value } })} className="input" />
              </div>
            </div>
          </div>

          {/* Section 7: Notes */}
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
