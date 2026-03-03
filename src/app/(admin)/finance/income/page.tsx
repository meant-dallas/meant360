'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateAmount } from '@/lib/validation';
import { analytics } from '@/lib/analytics';
import FieldError from '@/components/ui/FieldError';
import Link from 'next/link';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineChartBarSquare } from 'react-icons/hi2';

interface IncomeRecord {
  id: string;
  incomeType: string;
  eventName: string;
  eventId?: string;
  amount: string;
  date: string;
  paymentMethod: string;
  payerName: string;
  notes: string;
  _source?: string;
}

const INCOME_TYPES = ['Membership', 'Guest Fee', 'Event Entry', 'Donation', 'Sponsorship', 'Previous Committee', 'Other'];
const PAYMENT_METHODS = ['Cash', 'Check', 'Square', 'PayPal', 'Zelle', 'Bank Transfer', 'Other'];

const emptyForm = {
  incomeType: 'Membership',
  eventName: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  paymentMethod: 'Cash',
  payerName: '',
  notes: '',
};

export default function IncomePage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEvent) params.set('event', filterEvent);
      const res = await fetch(`/api/finance/income?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch income records');
    } finally {
      setLoading(false);
    }
  }, [filterEvent]);

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

  const openEdit = (record: IncomeRecord) => {
    setEditing(record);
    setForm({
      incomeType: record.incomeType,
      eventName: record.eventName,
      amount: record.amount,
      date: record.date,
      paymentMethod: record.paymentMethod,
      payerName: record.payerName,
      notes: record.notes,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string | null> = {};
    errors.amount = validateAmount(form.amount);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/finance/income', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (editing) {
          analytics.recordUpdated('income');
        } else {
          analytics.recordCreated('income');
        }
        toast.success(editing ? 'Income updated' : 'Income added');
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
    if (!confirm('Delete this income record?')) return;
    try {
      const res = await fetch(`/api/finance/income?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        analytics.recordDeleted('income');
        toast.success('Deleted');
        fetchRecords();
      } else {
        toast.error(json.error || 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  const sourceLabel = (source?: string) => {
    switch (source) {
      case 'event': return { text: 'Event', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' };
      case 'sponsorship': return { text: 'Sponsorship', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' };
      default: return { text: 'Manual', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
    }
  };

  const columns: Column<IncomeRecord>[] = [
    { key: 'date', header: 'Date', sortable: true, render: (item) => formatDate(item.date) },
    {
      key: '_source',
      header: 'Source',
      sortable: true,
      filterable: true,
      filterOptions: ['event', 'manual', 'sponsorship'],
      render: (item) => {
        const badge = sourceLabel(item._source);
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        );
      },
    },
    { key: 'incomeType', header: 'Type', sortable: true, filterable: true, filterOptions: INCOME_TYPES },
    { key: 'payerName', header: 'Payer / Details', sortable: true, filterable: true },
    {
      key: 'eventName',
      header: 'Event',
      sortable: true,
      filterable: true,
      render: (item) => {
        if (!item.eventName) return <span className="text-xs text-gray-400">-</span>;
        if (item.eventId) {
          return (
            <Link
              href={`/settings/events/${item.eventId}`}
              className="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline"
              title="Open Event Dashboard"
            >
              {item.eventName}
              <HiOutlineChartBarSquare className="w-3.5 h-3.5" />
            </Link>
          );
        }
        return <span className="text-sm">{item.eventName}</span>;
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      sortFn: (a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'),
      render: (item) => formatCurrency(parseFloat(item.amount || '0')),
    },
    { key: 'paymentMethod', header: 'Payment Method', sortable: true, filterable: true, filterOptions: PAYMENT_METHODS },
    ...(isAdmin ? [{
      key: 'actions' as const,
      header: '',
      render: (item: IncomeRecord) =>
        item._source && item._source !== 'manual' ? null : (
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

  const totalAmount = records.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Income"
        description={`${records.length} records | Total: ${formatCurrency(totalAmount)}`}
        action={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Income
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
          className="select w-full sm:w-48"
        >
          <option value="">All Events</option>
          {events.map((evt) => (
            <option key={evt.name} value={evt.name}>{evt.name}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={records}
        loading={loading}
        emptyMessage="No income records yet"
      />

      {/* Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Income' : 'Add Income'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Income Type</label>
            <select value={form.incomeType} onChange={(e) => setForm({ ...form, incomeType: e.target.value })} className="select">
              {INCOME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Payer Name</label>
            <input type="text" value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} className="input" placeholder="Name of payer" />
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
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
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
              <label className="label">Event (optional)</label>
              <select value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} className="select">
                <option value="">None</option>
                {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
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
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Income'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
