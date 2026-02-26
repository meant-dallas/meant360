'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import FileUpload from '@/components/ui/FileUpload';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineLink, HiOutlineCheckCircle } from 'react-icons/hi2';

interface ReimbursementRecord {
  id: string;
  expenseId: string;
  requestedBy: string;
  amount: string;
  description: string;
  eventName: string;
  category: string;
  receiptUrl: string;
  receiptFileId: string;
  status: string;
  approvedBy: string;
  approvedDate: string;
  reimbursedDate: string;
  notes: string;
}

const EXPENSE_CATEGORIES = [
  'Admin', 'Venue', 'Catering', 'Decorations', 'Sound & Lighting',
  'Transportation', 'Marketing', 'Insurance', 'Supplies', 'Miscellaneous',
];

const emptyForm = {
  requestedBy: '',
  amount: '',
  description: '',
  eventName: '',
  category: 'Miscellaneous',
  receiptUrl: '',
  receiptFileId: '',
  notes: '',
};

export default function ReimbursementsPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<ReimbursementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEvent, setFilterEvent] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterEvent) params.set('event', filterEvent);
      const res = await fetch(`/api/finance/reimbursements?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch reimbursements');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterEvent]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requestedBy.trim()) { toast.error('Requested by is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/finance/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Reimbursement request created');
        setModalOpen(false);
        setForm(emptyForm);
        fetchRecords();
      } else {
        toast.error(json.error || 'Failed to create');
      }
    } catch {
      toast.error('Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string, approvedBy?: string) => {
    try {
      const body: Record<string, string> = { id, status };
      if (approvedBy) body.approvedBy = approvedBy;
      const res = await fetch('/api/finance/reimbursements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Status updated to ${status}`);
        fetchRecords();
      } else {
        toast.error(json.error || 'Update failed');
      }
    } catch {
      toast.error('Update failed');
    }
  };

  const columns: Column<ReimbursementRecord>[] = [
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'description', header: 'Description' },
    { key: 'eventName', header: 'Event' },
    { key: 'category', header: 'Category' },
    { key: 'amount', header: 'Amount', render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    {
      key: 'receipt', header: 'Receipt',
      render: (item) =>
        item.receiptUrl ? (
          <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
            <HiOutlineLink className="w-4 h-4 inline" /> View
          </a>
        ) : <span className="text-gray-400 text-xs">None</span>,
    },
    { key: 'approvedDate', header: 'Approved', render: (item) => item.approvedDate ? formatDate(item.approvedDate) : '' },
    { key: 'reimbursedDate', header: 'Reimbursed', render: (item) => item.reimbursedDate ? formatDate(item.reimbursedDate) : '' },
    {
      key: 'actions', header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-1">
          {item.status === 'Pending' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'Approved', session?.user?.name || 'Admin'); }}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
              >
                Approve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'Rejected'); }}
                className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
              >
                Reject
              </button>
            </>
          )}
          {item.status === 'Approved' && (
            <button
              onClick={(e) => { e.stopPropagation(); updateStatus(item.id, 'Reimbursed'); }}
              className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1"
            >
              <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Mark Reimbursed
            </button>
          )}
        </div>
      ),
    },
  ];

  const outstanding = records
    .filter((r) => r.status === 'Pending' || r.status === 'Approved')
    .reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description={`Outstanding: ${formatCurrency(outstanding)}`}
        action={
          <button onClick={() => { setForm({ ...emptyForm, requestedBy: session?.user?.name || '' }); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
            <HiOutlinePlus className="w-4 h-4" /> New Request
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Reimbursed">Reimbursed</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Events</option>
          {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No reimbursement requests" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Reimbursement Request" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Requested By</label>
            <input type="text" value={form.requestedBy} className="input bg-gray-50" readOnly />
          </div>
          <div>
            <label className="label">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="What is being reimbursed?" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Event (optional)</label>
            <select value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} className="select">
              <option value="">None</option>
              {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
            </select>
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
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
