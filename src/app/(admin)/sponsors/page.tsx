'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, validateAmount, validateNameRequired } from '@/lib/validation';
import { analytics } from '@/lib/analytics';
import FieldError from '@/components/ui/FieldError';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';

interface SponsorRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  amount: string;
  eventName: string;
  year: string;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  notes: string;
  active: boolean;
}

const PAYMENT_METHODS = ['Cash', 'Check', 'Square', 'PayPal', 'Zelle', 'Bank Transfer', 'Other'];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: number[] = [];
for (let y = currentYear - 2; y <= currentYear + 2; y++) {
  YEAR_OPTIONS.push(y);
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  type: 'Annual' as 'Annual' | 'Event',
  amount: '',
  eventName: '',
  year: String(currentYear),
  paymentMethod: 'Check',
  paymentDate: new Date().toISOString().split('T')[0],
  status: 'Pending' as 'Paid' | 'Pending',
  notes: '',
};

export default function SponsorsPage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const [records, setRecords] = useState<SponsorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [events, setEvents] = useState<{ name: string }[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sponsors');
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch sponsors');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchEvents();
  }, [fetchRecords, fetchEvents]);

  const activeSponsors = records.filter((r) => r.active);
  const previousSponsors = records.filter((r) => !r.active);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (record: SponsorRecord) => {
    setEditing(record);
    setForm({
      name: record.name,
      email: record.email || '',
      phone: record.phone || '',
      type: (record.type as 'Annual' | 'Event') || 'Annual',
      amount: record.amount || '',
      eventName: record.eventName || '',
      year: record.year || String(currentYear),
      paymentMethod: record.paymentMethod || 'Check',
      paymentDate: record.paymentDate || '',
      status: (record.status as 'Paid' | 'Pending') || 'Pending',
      notes: record.notes || '',
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
    errors.amount = validateAmount(form.amount);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/sponsors', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (editing) {
          analytics.recordUpdated('sponsor');
        } else {
          analytics.recordCreated('sponsor');
        }
        toast.success(editing ? 'Sponsor updated' : 'Sponsor added');
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
    if (!confirm('Delete this sponsor?')) return;
    try {
      const res = await fetch(`/api/sponsors?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        analytics.recordDeleted('sponsor');
        toast.success('Deleted');
        fetchRecords();
      } else {
        toast.error(json.error || 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  const actionColumn: Column<SponsorRecord> = {
    key: 'actions' as const,
    header: '',
    render: (item: SponsorRecord) => (
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
  };

  const activeColumns: Column<SponsorRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Annual', 'Event'] },
    { key: 'amount', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'), render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'eventName', header: 'Event', sortable: true, filterable: true },
    { key: 'paymentMethod', header: 'Method', sortable: true, filterable: true, filterOptions: PAYMENT_METHODS },
    { key: 'status', header: 'Status', sortable: true, render: (item) => <StatusBadge status={item.status} /> },
    ...(isAdmin ? [actionColumn] : []),
  ];

  const previousColumns: Column<SponsorRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Annual', 'Event'] },
    { key: 'amount', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'), render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'eventName', header: 'Event', sortable: true, filterable: true },
    { key: 'year', header: 'Year', sortable: true },
    { key: 'paymentMethod', header: 'Method', sortable: true, filterable: true, filterOptions: PAYMENT_METHODS },
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Paid', 'Pending'], render: (item) => <StatusBadge status={item.status} /> },
    ...(isAdmin ? [actionColumn] : []),
  ];

  const activePaid = activeSponsors.filter((r) => r.status === 'Paid').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Sponsors"
        description={`${activeSponsors.length} active in ${currentYear} | Paid: ${formatCurrency(activePaid)}`}
        action={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Sponsor
            </button>
          ) : undefined
        }
      />

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Active Sponsors ({currentYear})
          </h2>
          <DataTable columns={activeColumns} data={activeSponsors} loading={loading} emptyMessage="No active sponsors this year" />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Previous Sponsors
          </h2>
          <DataTable columns={previousColumns} data={previousSponsors} loading={loading} emptyMessage="No previous sponsors" />
        </section>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sponsor' : 'Add Sponsor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name *</label>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div>
              <label className="label">Year</label>
              <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="select">
                {YEAR_OPTIONS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'Annual' | 'Event' })} className="select">
                <option value="Annual">Annual</option>
                <option value="Event">Event-specific</option>
              </select>
            </div>
            <div>
              <label className="label">Event {form.type === 'Annual' ? '(N/A)' : ''}</label>
              <select
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                className="select"
                disabled={form.type === 'Annual'}
              >
                <option value="">Select event</option>
                {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Amount ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => { setForm({ ...form, amount: e.target.value }); setFieldErrors((fe) => ({ ...fe, amount: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, amount: validateAmount(form.amount) }))}
                className={`input ${fieldErrors.amount ? 'border-red-500 dark:border-red-500' : ''}`}
                required
              />
              <FieldError error={fieldErrors.amount} />
            </div>
            <div>
              <label className="label">Payment Date</label>
              <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="select">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Paid' | 'Pending' })} className="select">
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Sponsor'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
