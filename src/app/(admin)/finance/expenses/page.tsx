'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { validateAmount } from '@/lib/validation';
import { analytics } from '@/lib/analytics';
import FieldError from '@/components/ui/FieldError';
import { useYear } from '@/contexts/YearContext';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineLink, HiOutlineBanknotes } from 'react-icons/hi2';

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
  needsReimbursement: string;
  reimbStatus: string;
  reimbMethod: string;
  reimbAmount: string;
  approvedBy: string;
  approvedDate: string;
  reimbursedDate: string;
}

/** Google Sheets may store 'true' as 'TRUE' — normalize for comparison */
function isTruthy(val: string | undefined): boolean {
  return val?.toLowerCase() === 'true';
}

const EXPENSE_CATEGORIES = [
  'Admin', 'Venue', 'Catering', 'Decorations', 'Sound & Lighting',
  'Transportation', 'Marketing', 'Insurance', 'Supplies', 'Miscellaneous',
];

const REIMB_STATUSES = ['Pending', 'Approved', 'Reimbursed', 'Rejected'];
const REIMB_METHODS = ['Check', 'Zelle', 'Venmo', 'Cash', 'Bank Transfer'];

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
  needsReimbursement: '',
};

const emptyReimbForm = {
  reimbStatus: 'Pending',
  reimbMethod: '',
  reimbAmount: '',
  reimbursedDate: '',
};

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-gray-400 text-xs">N/A</span>;
  const colors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    Approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Reimbursed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function ExpensesPage() {
  const { data: session } = useSession();
  const { year } = useYear();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const canCreate = role === 'admin' || role === 'committee';
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterReimbStatus, setFilterReimbStatus] = useState('');

  // Reimbursement management modal
  const [reimbModalOpen, setReimbModalOpen] = useState(false);
  const [reimbTarget, setReimbTarget] = useState<ExpenseRecord | null>(null);
  const [reimbForm, setReimbForm] = useState(emptyReimbForm);
  const [reimbSaving, setReimbSaving] = useState(false);
  const [reimbErrors, setReimbErrors] = useState<Record<string, string | null>>({});

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', String(year));
      if (filterEvent) params.set('event', filterEvent);
      if (filterCategory) params.set('category', filterCategory);
      if (filterReimbStatus) params.set('reimbStatus', filterReimbStatus);
      const res = await fetch(`/api/finance/expenses?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  }, [year, filterEvent, filterCategory, filterReimbStatus]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?year=${year}`);
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } catch { /* ignore */ }
  }, [year]);

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
    setFieldErrors({});
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
      needsReimbursement: isTruthy(record.needsReimbursement) ? 'true' : '',
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const openReimbModal = (record: ExpenseRecord) => {
    setReimbTarget(record);
    setReimbForm({
      reimbStatus: record.reimbStatus || 'Pending',
      reimbMethod: record.reimbMethod || '',
      reimbAmount: record.reimbAmount || record.amount || '',
      reimbursedDate: record.reimbursedDate || '',
    });
    setReimbErrors({});
    setReimbModalOpen(true);
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
      const res = await fetch('/api/finance/expenses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (editing) {
          analytics.recordUpdated('expense');
        } else {
          analytics.recordCreated('expense');
        }
        toast.success(editing ? 'Expense updated' : 'Expense added');
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

  const handleReimbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reimbTarget) return;

    // Validate required fields when marking as Reimbursed
    const errors: Record<string, string | null> = {};
    if (reimbForm.reimbStatus === 'Reimbursed') {
      if (!reimbForm.reimbMethod) errors.reimbMethod = 'Payment method is required';
      if (!reimbForm.reimbAmount) errors.reimbAmount = 'Amount is required';
      else if (parseFloat(reimbForm.reimbAmount) <= 0) errors.reimbAmount = 'Amount must be greater than 0';
      if (!reimbForm.reimbursedDate) errors.reimbursedDate = 'Date of payment is required';
    }
    setReimbErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setReimbSaving(true);
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reimbTarget.id,
          reimbStatus: reimbForm.reimbStatus,
          reimbMethod: reimbForm.reimbMethod,
          reimbAmount: reimbForm.reimbAmount,
          reimbursedDate: reimbForm.reimbursedDate,
          approvedBy: session?.user?.name || '',
        }),
      });
      const json = await res.json();
      if (json.success) {
        analytics.recordUpdated('expense');
        toast.success('Reimbursement updated');
        setReimbModalOpen(false);
        fetchRecords();
      } else {
        toast.error(json.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setReimbSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense record? The receipt file will also be removed.')) return;
    try {
      const res = await fetch(`/api/finance/expenses?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { analytics.recordDeleted('expense'); toast.success('Deleted'); fetchRecords(); }
      else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete failed'); }
  };

  // Whether the needsReimbursement checkbox can be toggled off
  const canToggleReimbOff = !editing || !['Approved', 'Reimbursed'].includes(editing.reimbStatus);

  const columns: Column<ExpenseRecord>[] = [
    { key: 'date', header: 'Date', sortable: true, render: (item) => formatDate(item.date) },
    { key: 'category', header: 'Category', sortable: true, filterable: true, filterOptions: EXPENSE_CATEGORIES },
    { key: 'description', header: 'Description', sortable: true, filterable: true },
    { key: 'eventName', header: 'Event', sortable: true, filterable: true },
    { key: 'amount', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'), render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'paidBy', header: 'Paid By', sortable: true, filterable: true },
    {
      key: 'reimbStatus', header: 'Reimb. Status', sortable: true,
      render: (item) => {
        if (!isTruthy(item.needsReimbursement)) {
          return <span className="text-gray-400 text-xs">N/A</span>;
        }
        if (canCreate) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); openReimbModal(item); }}
              className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 group"
              title="Click to manage reimbursement"
            >
              <StatusBadge status={item.reimbStatus} />
              <HiOutlinePencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        }
        return <StatusBadge status={item.reimbStatus} />;
      },
    },
    {
      key: 'receipt', header: 'Receipt',
      render: (item) =>
        item.receiptUrl ? (
          <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
            <HiOutlineLink className="w-4 h-4 inline" /> View
          </a>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 text-xs">None</span>
        ),
    },
    ...(canCreate ? [{
      key: 'actions' as const, header: '',
      render: (item: ExpenseRecord) => (
        <div className="flex items-center gap-1">
          {isTruthy(item.needsReimbursement) && (
            <button
              onClick={(e) => { e.stopPropagation(); openReimbModal(item); }}
              className="p-1.5 text-orange-500 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 rounded"
              title="Manage reimbursement"
            >
              <HiOutlineBanknotes className="w-4 h-4" />
            </button>
          )}
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

  const totalExpenses = records.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
  const outstandingReimb = records
    .filter((r) => isTruthy(r.needsReimbursement) && (r.reimbStatus === 'Pending' || r.reimbStatus === 'Approved'))
    .reduce((s, r) => s + parseFloat(r.reimbAmount || r.amount || '0'), 0);

  // Whether reimbursement fields are required (when status is Reimbursed)
  const reimbFieldsRequired = reimbForm.reimbStatus === 'Reimbursed';

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${records.length} records | Total: ${formatCurrency(totalExpenses)}${outstandingReimb > 0 ? ` | Outstanding Reimbursements: ${formatCurrency(outstandingReimb)}` : ''}`}
        action={
          canCreate ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Expense
            </button>
          ) : undefined
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
        <select value={filterReimbStatus} onChange={(e) => setFilterReimbStatus(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Reimb. Status</option>
          {REIMB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No expense records yet" />

      {/* Expense create/edit modal */}
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
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.needsReimbursement === 'true'}
                onChange={(e) => setForm({ ...form, needsReimbursement: e.target.checked ? 'true' : '' })}
                className="accent-primary-600 w-4 h-4"
                disabled={!canToggleReimbOff && form.needsReimbursement === 'true'}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Needs Reimbursement</span>
            </label>
            {!canToggleReimbOff && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                Cannot uncheck — reimbursement is already {editing?.reimbStatus?.toLowerCase()}
              </p>
            )}
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

      {/* Reimbursement management modal */}
      <Modal open={reimbModalOpen} onClose={() => setReimbModalOpen(false)} title="Manage Reimbursement">
        {reimbTarget && (
          <form onSubmit={handleReimbSubmit} className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-gray-500 dark:text-gray-400">Expense:</span> {reimbTarget.description || reimbTarget.category}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Paid By:</span> {reimbTarget.paidBy}</p>
              <p><span className="text-gray-500 dark:text-gray-400">Expense Amount:</span> {formatCurrency(parseFloat(reimbTarget.amount || '0'))}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Status *</label>
                <select
                  value={reimbForm.reimbStatus}
                  onChange={(e) => { setReimbForm({ ...reimbForm, reimbStatus: e.target.value }); setReimbErrors({}); }}
                  className="select"
                >
                  {REIMB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Payment Method {reimbFieldsRequired ? '*' : ''}</label>
                <select
                  value={reimbForm.reimbMethod}
                  onChange={(e) => { setReimbForm({ ...reimbForm, reimbMethod: e.target.value }); setReimbErrors((fe) => ({ ...fe, reimbMethod: null })); }}
                  className={`select ${reimbErrors.reimbMethod ? 'border-red-500 dark:border-red-500' : ''}`}
                >
                  <option value="">Select method</option>
                  {REIMB_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <FieldError error={reimbErrors.reimbMethod} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Reimbursement Amount ($) {reimbFieldsRequired ? '*' : ''}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={reimbForm.reimbAmount}
                  onChange={(e) => { setReimbForm({ ...reimbForm, reimbAmount: e.target.value }); setReimbErrors((fe) => ({ ...fe, reimbAmount: null })); }}
                  className={`input ${reimbErrors.reimbAmount ? 'border-red-500 dark:border-red-500' : ''}`}
                  placeholder={reimbTarget.amount}
                />
                <FieldError error={reimbErrors.reimbAmount} />
              </div>
              <div>
                <label className="label">Date of Payment {reimbFieldsRequired ? '*' : ''}</label>
                <input
                  type="date"
                  value={reimbForm.reimbursedDate}
                  onChange={(e) => { setReimbForm({ ...reimbForm, reimbursedDate: e.target.value }); setReimbErrors((fe) => ({ ...fe, reimbursedDate: null })); }}
                  className={`input ${reimbErrors.reimbursedDate ? 'border-red-500 dark:border-red-500' : ''}`}
                />
                <FieldError error={reimbErrors.reimbursedDate} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setReimbModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={reimbSaving} className="btn-primary">
                {reimbSaving ? 'Saving...' : 'Update Reimbursement'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
