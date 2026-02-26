'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineLink } from 'react-icons/hi2';

interface ExpenseRecord {
  id: string;
  expenseType: string;
  eventName: string;
  category: string;
  description: string;
  amount: string;
  date: string;
  paidBy: string;
  receiptUrl: string;
  receiptFileId: string;
  notes: string;
}

const EXPENSE_CATEGORIES = [
  'Admin', 'Venue', 'Catering', 'Decorations', 'Sound & Lighting',
  'Transportation', 'Marketing', 'Insurance', 'Supplies', 'Miscellaneous',
];
const emptyForm = {
  expenseType: 'General' as 'General' | 'Event',
  eventName: '',
  category: 'Miscellaneous',
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  paidBy: 'Organization',
  receiptUrl: '',
  receiptFileId: '',
  notes: '',
};

export default function ExpensesPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEvent) params.set('event', filterEvent);
      if (filterCategory) params.set('category', filterCategory);
      const res = await fetch(`/api/finance/expenses?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  }, [filterEvent, filterCategory]);

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
    setForm({
      ...emptyForm,
      paidBy: session?.user?.name || 'Organization',
    });
    setModalOpen(true);
  };

  const openEdit = (record: ExpenseRecord) => {
    setEditing(record);
    setForm({
      expenseType: record.expenseType as 'General' | 'Event',
      eventName: record.eventName,
      category: record.category,
      description: record.description,
      amount: record.amount,
      date: record.date,
      paidBy: record.paidBy,
      receiptUrl: record.receiptUrl,
      receiptFileId: record.receiptFileId,
      notes: record.notes,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/finance/expenses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        // Auto-create reimbursement if paid by a member (not Organization)
        if (!editing && form.paidBy !== 'Organization') {
          const expenseId = json.data?.id || '';
          try {
            await fetch('/api/finance/reimbursements', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestedBy: form.paidBy,
                expenseId,
                amount: form.amount,
                description: form.description,
                eventName: form.eventName,
                category: form.category,
                receiptUrl: form.receiptUrl,
                receiptFileId: form.receiptFileId,
              }),
            });
            toast.success('Expense added & reimbursement created');
          } catch {
            toast.success('Expense added (reimbursement creation failed)');
          }
        } else {
          toast.success(editing ? 'Expense updated' : 'Expense added');
        }
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
    if (!confirm('Delete this expense record? The receipt file will also be removed.')) return;
    try {
      const res = await fetch(`/api/finance/expenses?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Deleted'); fetchRecords(); }
      else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete failed'); }
  };

  const columns: Column<ExpenseRecord>[] = [
    { key: 'date', header: 'Date', render: (item) => formatDate(item.date) },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'eventName', header: 'Event' },
    { key: 'amount', header: 'Amount', render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'paidBy', header: 'Paid By' },
    {
      key: 'receipt', header: 'Receipt',
      render: (item) =>
        item.receiptUrl ? (
          <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
            <HiOutlineLink className="w-4 h-4 inline" /> View
          </a>
        ) : (
          <span className="text-gray-400 text-xs">None</span>
        ),
    },
    {
      key: 'actions', header: '',
      render: (item) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
            <HiOutlinePencil className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const totalExpenses = records.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${records.length} records | Total: ${formatCurrency(totalExpenses)}`}
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <HiOutlinePlus className="w-4 h-4" /> Add Expense
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Events</option>
          {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No expense records yet" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Expense' : 'Add Expense'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value as 'General' | 'Event' })} className="select">
                <option value="General">General</option>
                <option value="Event">Event</option>
              </select>
            </div>
            <div>
              <label className="label">Event {form.expenseType === 'General' ? '(N/A)' : ''}</label>
              <select value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} className="select" disabled={form.expenseType === 'General'}>
                <option value="">Select event</option>
                {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Paid By</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="paidBy"
                    checked={form.paidBy !== 'Organization'}
                    onChange={() => setForm({ ...form, paidBy: session?.user?.name || '' })}
                    className="accent-primary-600"
                  />
                  <span className="text-sm">{session?.user?.name || 'Me'}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="paidBy"
                    checked={form.paidBy === 'Organization'}
                    onChange={() => setForm({ ...form, paidBy: 'Organization' })}
                    className="accent-primary-600"
                  />
                  <span className="text-sm">Organization</span>
                </label>
              </div>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="What was this expense for?" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
            </div>
          </div>
          <div>
            <label className="label">Receipt</label>
            <FileUpload
              currentUrl={form.receiptUrl}
              onUploadComplete={({ fileId, webViewLink }) => setForm({ ...form, receiptUrl: webViewLink, receiptFileId: fileId })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editing ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
