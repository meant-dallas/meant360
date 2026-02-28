'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, validateAmount } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';

interface SponsorshipRecord {
  id: string;
  sponsorName: string;
  year: string;
  sponsorEmail: string;
  sponsorPhone: string;
  type: string;
  amount: string;
  eventName: string;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  notes: string;
}

const PAYMENT_METHODS = ['Cash', 'Check', 'Square', 'PayPal', 'Zelle', 'Bank Transfer', 'Other'];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: number[] = [];
for (let y = currentYear - 2; y <= currentYear + 2; y++) {
  YEAR_OPTIONS.push(y);
}

const emptyForm = {
  sponsorName: '',
  year: String(currentYear),
  sponsorEmail: '',
  sponsorPhone: '',
  type: 'Annual' as 'Annual' | 'Event',
  amount: '',
  eventName: '',
  paymentMethod: 'Check',
  paymentDate: new Date().toISOString().split('T')[0],
  status: 'Pending' as 'Paid' | 'Pending',
  notes: '',
};

export default function SponsorshipPage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const [records, setRecords] = useState<SponsorshipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorshipRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      if (filterYear) params.set('year', filterYear);
      const res = await fetch(`/api/sponsors/sponsorships?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch sponsorship records');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterYear]);

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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (record: SponsorshipRecord) => {
    setEditing(record);
    setForm({
      sponsorName: record.sponsorName,
      year: record.year || String(currentYear),
      sponsorEmail: record.sponsorEmail || '',
      sponsorPhone: record.sponsorPhone || '',
      type: record.type as 'Annual' | 'Event',
      amount: record.amount,
      eventName: record.eventName,
      paymentMethod: record.paymentMethod,
      paymentDate: record.paymentDate,
      status: record.status as 'Paid' | 'Pending',
      notes: record.notes,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string | null> = {};
    if (!form.sponsorName.trim()) errors.sponsorName = 'Sponsor name is required';
    errors.sponsorEmail = validateEmail(form.sponsorEmail);
    errors.sponsorPhone = validatePhone(form.sponsorPhone);
    errors.amount = validateAmount(form.amount);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/sponsors/sponsorships', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? 'Sponsorship updated' : 'Sponsorship added');
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
    if (!confirm('Delete this sponsorship record?')) return;
    try {
      const res = await fetch(`/api/sponsors/sponsorships?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Deleted'); fetchRecords(); }
      else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete failed'); }
  };

  const columns: Column<SponsorshipRecord>[] = [
    { key: 'sponsorName', header: 'Sponsor', sortable: true, filterable: true },
    { key: 'year', header: 'Year', sortable: true },
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Annual', 'Event'] },
    { key: 'eventName', header: 'Event', sortable: true, filterable: true },
    { key: 'amount', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'), render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'paymentDate', header: 'Payment Date', sortable: true, render: (item) => formatDate(item.paymentDate) },
    { key: 'paymentMethod', header: 'Method', sortable: true, filterable: true, filterOptions: PAYMENT_METHODS },
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Paid', 'Pending'], render: (item) => <StatusBadge status={item.status} /> },
    ...(isAdmin ? [{
      key: 'actions' as const, header: '',
      render: (item: SponsorshipRecord) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded">
            <HiOutlinePencil className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ),
    }] : []),
  ];

  const totalPaid = records.filter((r) => r.status === 'Paid').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const totalPending = records.filter((r) => r.status === 'Pending').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Sponsorship"
        description={`Paid: ${formatCurrency(totalPaid)} | Pending: ${formatCurrency(totalPending)}`}
        action={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Sponsorship
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Years</option>
          {YEAR_OPTIONS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Types</option>
          <option value="Annual">Annual</option>
          <option value="Event">Event</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Statuses</option>
          <option value="Paid">Paid</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No sponsorship records yet" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sponsorship' : 'Add Sponsorship'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Sponsor Name *</label>
            <input
              type="text"
              value={form.sponsorName}
              onChange={(e) => { setForm({ ...form, sponsorName: e.target.value }); setFieldErrors((fe) => ({ ...fe, sponsorName: null })); }}
              className={`input ${fieldErrors.sponsorName ? 'border-red-500 dark:border-red-500' : ''}`}
              required
            />
            <FieldError error={fieldErrors.sponsorName} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Year</label>
              <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="select">
                {YEAR_OPTIONS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sponsor Email</label>
              <input
                type="email"
                value={form.sponsorEmail}
                onChange={(e) => { setForm({ ...form, sponsorEmail: e.target.value }); setFieldErrors((fe) => ({ ...fe, sponsorEmail: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, sponsorEmail: validateEmail(form.sponsorEmail) }))}
                className={`input ${fieldErrors.sponsorEmail ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.sponsorEmail} />
            </div>
            <div>
              <label className="label">Sponsor Phone</label>
              <input
                type="tel"
                value={form.sponsorPhone}
                onChange={(e) => { setForm({ ...form, sponsorPhone: e.target.value }); setFieldErrors((fe) => ({ ...fe, sponsorPhone: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, sponsorPhone: validatePhone(form.sponsorPhone) }))}
                className={`input ${fieldErrors.sponsorPhone ? 'border-red-500 dark:border-red-500' : ''}`}
              />
              <FieldError error={fieldErrors.sponsorPhone} />
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
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Sponsorship'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
