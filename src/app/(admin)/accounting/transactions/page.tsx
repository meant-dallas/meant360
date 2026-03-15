'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';

interface Transaction {
  id: string;
  provider: string;
  type: string;
  grossAmount: string;
  fee: string;
  netAmount: string;
  payerName: string | null;
  description: string | null;
  transactionDate: string;
  status: string;
  categoryId: string | null;
  eventId: string | null;
  category: { id: string; name: string; type: string } | null;
  event: { id: string; name: string } | null;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

interface EventOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Needs Review',
  CLASSIFIED: 'Categorized',
  SPLIT: 'Categorized',
  LEDGERED: 'Recorded',
  RECONCILED: 'Verified',
};

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ needsReview: 0, categorized: 0, recorded: 0, verified: 0, total: 0 });

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [providerFilter, setProviderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(false);
  const [showClassify, setShowClassify] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [classifyCatId, setClassifyCatId] = useState('');
  const [classifyEventId, setClassifyEventId] = useState('');

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    type: 'payment',
    grossAmount: '',
    description: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    eventId: '',
    payerName: '',
    notes: '',
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (providerFilter) params.set('provider', providerFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', String(page));
      params.set('pageSize', '25');

      const res = await fetch(`/api/fin/transactions?${params}`);
      const json = await res.json();
      if (json.success) {
        setTransactions(json.data.data);
        setTotal(json.data.total);
        setTotalPages(json.data.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, providerFilter, typeFilter, startDate, endDate, page]);

  const fetchMeta = useCallback(async () => {
    try {
      const [catRes, eventRes] = await Promise.all([
        fetch('/api/fin/categories'),
        fetch('/api/events'),
      ]);
      const catJson = await catRes.json();
      const eventJson = await eventRes.json();
      if (catJson.success) setCategories(catJson.data);
      if (eventJson.success) setEvents(eventJson.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
    } catch {}
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  // Fetch stats separately
  useEffect(() => {
    fetch('/api/fin/overview')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStats(json.data.transactionStats);
      })
      .catch(() => {});
  }, [transactions]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleClassify = async () => {
    if (!classifyCatId || selected.size === 0) return;
    try {
      const res = await fetch('/api/fin/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: Array.from(selected),
          categoryId: classifyCatId,
          eventId: classifyEventId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowClassify(false);
        setSelected(new Set());
        setClassifyCatId('');
        setClassifyEventId('');
        fetchTransactions();
      }
    } catch (err) {
      console.error('Classify failed:', err);
    }
  };

  const handleRecordToBooks = async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch('/api/fin/ledger/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: Array.from(selected) }),
      });
      const json = await res.json();
      if (json.success) {
        setSelected(new Set());
        fetchTransactions();
      }
    } catch (err) {
      console.error('Record to books failed:', err);
    }
  };

  const handleManualCreate = async () => {
    const amount = parseFloat(manualForm.grossAmount);
    if (isNaN(amount)) return;
    try {
      const res = await fetch('/api/fin/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'manual',
          type: manualForm.type,
          grossAmount: amount,
          description: manualForm.description,
          transactionDate: manualForm.transactionDate,
          categoryId: manualForm.categoryId || undefined,
          eventId: manualForm.eventId || undefined,
          payerName: manualForm.payerName || undefined,
          notes: manualForm.notes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowManual(false);
        setManualForm({ type: 'payment', grossAmount: '', description: '', transactionDate: new Date().toISOString().slice(0, 10), categoryId: '', eventId: '', payerName: '', notes: '' });
        fetchTransactions();
      }
    } catch (err) {
      console.error('Create failed:', err);
    }
  };

  const selectedNEW = transactions.filter((t) => selected.has(t.id) && t.status === 'NEW');
  const selectedClassified = transactions.filter((t) => selected.has(t.id) && (t.status === 'CLASSIFIED' || t.status === 'SPLIT'));

  return (
    <div>
      <PageHeader
        title="Transactions"
        action={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowUpload(true)} className="btn btn-outline text-sm">Upload Bank CSV</button>
            <button onClick={() => setShowManual(true)} className="btn btn-primary text-sm">+ Add Transaction</button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Needs Review" value={String(stats.needsReview)} className={stats.needsReview > 0 ? 'border-l-4 border-yellow-400' : ''} />
        <StatCard title="Categorized" value={String(stats.categorized)} className="border-l-4 border-blue-400" />
        <StatCard title="Recorded" value={String(stats.recorded)} className="border-l-4 border-indigo-400" />
        <StatCard title="Verified" value={String(stats.verified)} className="border-l-4 border-green-400" />
      </div>

      {/* Filters + Actions */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[130px]">
            <option value="">All Statuses</option>
            <option value="NEW">Needs Review</option>
            <option value="CLASSIFIED">Categorized</option>
            <option value="LEDGERED">Recorded</option>
            <option value="RECONCILED">Verified</option>
          </select>
          <select value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[120px]">
            <option value="">All Sources</option>
            <option value="square">Square</option>
            <option value="paypal">PayPal</option>
            <option value="bank">Bank</option>
            <option value="manual">Manual</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[110px]">
            <option value="">All Types</option>
            <option value="payment">Payment</option>
            <option value="fee">Fee</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        </div>

        {selected.size > 0 && (
          <div className="flex gap-2 mt-3 items-center pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">{selected.size} selected</span>
            {selectedNEW.length > 0 && (
              <button onClick={() => setShowClassify(true)} className="btn btn-outline text-sm py-1">
                Categorize ({selectedNEW.length})
              </button>
            )}
            {selectedClassified.length > 0 && (
              <button onClick={handleRecordToBooks} className="btn btn-primary text-sm py-1">
                Record to Books ({selectedClassified.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="p-3 text-left w-10">
                <input type="checkbox" checked={selected.size === transactions.length && transactions.length > 0} onChange={toggleAll} className="accent-primary-600" />
              </th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Date</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Description</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Source</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Category</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Event</th>
              <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Amount</th>
              <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">No transactions found</td></tr>
            ) : transactions.map((txn) => {
              const amount = Number(txn.grossAmount);
              const isNew = txn.status === 'NEW';
              return (
                <tr key={txn.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isNew ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(txn.id)} onChange={() => toggleSelect(txn.id)} className="accent-primary-600" />
                  </td>
                  <td className="p-3 whitespace-nowrap">{new Date(txn.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="p-3 max-w-[250px] truncate">{txn.description || txn.payerName || '--'}</td>
                  <td className="p-3 capitalize">{txn.provider}</td>
                  <td className="p-3">{txn.category?.name || <span className="text-gray-400">--</span>}</td>
                  <td className="p-3">{txn.event?.name || <span className="text-gray-400">--</span>}</td>
                  <td className={`p-3 text-right font-semibold ${amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {amount >= 0 ? '+' : ''}{formatCurrency(amount)}
                  </td>
                  <td className="p-3 text-center">
                    <StatusBadge status={STATUS_LABELS[txn.status] || txn.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500">Showing page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-outline text-xs py-1 px-3">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-outline text-xs py-1 px-3">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card p-4 mt-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <h3 className="text-sm font-semibold mb-2">How it works</h3>
        <div className="flex flex-wrap gap-6 text-xs text-gray-600 dark:text-gray-400">
          <div><strong className="text-yellow-600">1. Needs Review</strong> — New imports. Assign a category.</div>
          <div><strong className="text-blue-600">2. Categorized</strong> — Category assigned. Click &quot;Record to Books&quot;.</div>
          <div><strong className="text-indigo-600">3. Recorded</strong> — In the books. Go to Bank Matching to verify.</div>
          <div><strong className="text-green-600">4. Verified</strong> — Matched to bank. Fully accounted for.</div>
        </div>
      </div>

      {/* Classify Modal */}
      <Modal open={showClassify} onClose={() => setShowClassify(false)} title="Categorize Transactions">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Assign a category to {selectedNEW.length} selected transaction{selectedNEW.length !== 1 ? 's' : ''}.
        </p>
        <label className="block text-sm font-medium mb-1">Category</label>
        <select value={classifyCatId} onChange={(e) => setClassifyCatId(e.target.value)} className="input w-full mb-3">
          <option value="">-- Select category --</option>
          <optgroup label="Income">
            {categories.filter((c) => c.type === 'income').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Expense">
            {categories.filter((c) => c.type === 'expense').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        <label className="block text-sm font-medium mb-1">Event (optional)</label>
        <select value={classifyEventId} onChange={(e) => setClassifyEventId(e.target.value)} className="input w-full mb-4">
          <option value="">-- No event --</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowClassify(false)} className="btn btn-outline">Cancel</button>
          <button onClick={handleClassify} disabled={!classifyCatId} className="btn btn-primary">Categorize</button>
        </div>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal open={showManual} onClose={() => setShowManual(false)} title="Add Transaction">
        <label className="block text-sm font-medium mb-1">Type</label>
        <select value={manualForm.type} onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })} className="input w-full mb-3">
          <option value="payment">Income (money received)</option>
          <option value="manual">Expense (money paid out)</option>
        </select>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input value={manualForm.description} onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })} className="input w-full mb-3" placeholder="e.g., Venue deposit for Holi event" />
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input type="number" step="0.01" value={manualForm.grossAmount} onChange={(e) => setManualForm({ ...manualForm, grossAmount: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
        <label className="block text-sm font-medium mb-1">Date</label>
        <input type="date" value={manualForm.transactionDate} onChange={(e) => setManualForm({ ...manualForm, transactionDate: e.target.value })} className="input w-full mb-3" />
        <label className="block text-sm font-medium mb-1">Category</label>
        <select value={manualForm.categoryId} onChange={(e) => setManualForm({ ...manualForm, categoryId: e.target.value })} className="input w-full mb-3">
          <option value="">-- Select category --</option>
          <optgroup label="Income">
            {categories.filter((c) => c.type === 'income').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Expense">
            {categories.filter((c) => c.type === 'expense').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        <label className="block text-sm font-medium mb-1">Event (optional)</label>
        <select value={manualForm.eventId} onChange={(e) => setManualForm({ ...manualForm, eventId: e.target.value })} className="input w-full mb-3">
          <option value="">-- No event --</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="block text-sm font-medium mb-1">Paid by / Received from</label>
        <input value={manualForm.payerName} onChange={(e) => setManualForm({ ...manualForm, payerName: e.target.value })} className="input w-full mb-3" placeholder="Person or company name" />
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} className="input w-full mb-4" rows={2} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowManual(false)} className="btn btn-outline">Cancel</button>
          <button onClick={handleManualCreate} className="btn btn-primary">Save Transaction</button>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Bank Statement">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Upload a CSV file from your bank. We&apos;ll import the deposits and withdrawals as new transactions.
        </p>
        <label className="block text-sm font-medium mb-1">CSV File</label>
        <input type="file" accept=".csv" className="input w-full mb-2" />
        <p className="text-xs text-gray-400 mb-4">Supported format: Date, Description, Amount columns</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowUpload(false)} className="btn btn-outline">Cancel</button>
          <button className="btn btn-primary">Upload & Import</button>
        </div>
      </Modal>
    </div>
  );
}
