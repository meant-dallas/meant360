'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PageHeader from '@/components/ui/PageHeader';
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
  excluded: boolean;
  category: { id: string; name: string; type: string } | null;
  event: { id: string; name: string } | null;
  splits: Array<{ id: string; amount: string; categoryId: string | null; accountName: string | null; notes: string | null; category: { name: string } | null }>;
}

interface Category { id: string; name: string; type: string }
interface EventOption { id: string; name: string }

function SortableHeader({ field, label, sortBy, sortOrder, onSort, align = 'left' }: {
  field: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc'; onSort: (field: string) => void; align?: 'left' | 'right'
}) {
  const active = sortBy === field;
  return (
    <th
      className={`p-3 text-${align} font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-200`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 text-xs">
        {active ? (sortOrder === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [sortBy, setSortBy] = useState('transactionDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(false);
  const [showClassify, setShowClassify] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [syncProvider, setSyncProvider] = useState<'square' | 'paypal'>('square');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; updated?: number; total: number } | null>(null);
  const [classifyCatId, setClassifyCatId] = useState('');
  const [classifyEventId, setClassifyEventId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [splitRows, setSplitRows] = useState<Array<{ categoryId: string; amount: string; notes: string }>>([
    { categoryId: '', amount: '', notes: '' },
    { categoryId: '', amount: '', notes: '' },
  ]);
  const [splitSaving, setSplitSaving] = useState(false);

  const [manualForm, setManualForm] = useState({
    type: 'income',
    grossAmount: '',
    description: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    status: 'Completed',
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
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (eventFilter) params.set('eventId', eventFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', String(page));
      params.set('pageSize', '25');
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

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
  }, [statusFilter, providerFilter, typeFilter, categoryFilter, eventFilter, startDate, endDate, page, sortBy, sortOrder]);

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map((t) => t.id)));
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
      } else {
        alert(json.error || 'Failed to categorize');
      }
    } catch (err) {
      console.error('Classify failed:', err);
      alert('Failed to categorize. Please try again.');
    }
  };

  const handleToggleExclude = async (txn: Transaction) => {
    try {
      await fetch('/api/fin/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txn.id, excluded: !txn.excluded }),
      });
      fetchTransactions();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await fetch('/api/fin/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchTransactions();
    } catch {}
  };

  const handleOpenSplit = (txn: Transaction) => {
    setSplitTxn(txn);
    if (txn.splits.length > 0) {
      setSplitRows(txn.splits.map((s) => ({
        categoryId: s.categoryId || '',
        amount: String(Number(s.amount)),
        notes: s.notes || '',
      })));
    } else {
      setSplitRows([
        { categoryId: '', amount: '', notes: '' },
        { categoryId: '', amount: '', notes: '' },
      ]);
    }
    setShowSplit(true);
  };

  const handleRemoveSplits = async (txnId: string) => {
    if (!confirm('Remove all splits from this transaction?')) return;
    try {
      const res = await fetch('/api/fin/splits', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txnId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchTransactions();
      } else {
        alert(json.error || 'Failed to remove splits');
      }
    } catch {
      alert('Failed to remove splits');
    }
  };

  const splitTotal = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const splitGross = splitTxn ? Math.abs(Number(splitTxn.grossAmount)) : 0;
  const splitRemaining = splitGross - splitTotal;

  const handleSaveSplit = async () => {
    if (!splitTxn) return;
    const validRows = splitRows.filter((r) => r.amount && parseFloat(r.amount) > 0);
    if (validRows.length < 2) { alert('At least 2 split rows with amounts are required.'); return; }
    if (!validRows.every((r) => r.categoryId)) { alert('Every split row must have a category.'); return; }
    if (Math.abs(splitRemaining) > 0.01) { alert(`Split amounts must equal ${formatCurrency(splitGross)}. Remaining: ${formatCurrency(splitRemaining)}`); return; }

    setSplitSaving(true);
    try {
      const res = await fetch('/api/fin/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: splitTxn.id,
          splits: validRows.map((r) => ({
            categoryId: r.categoryId,
            amount: parseFloat(r.amount),
            notes: r.notes || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowSplit(false);
        fetchTransactions();
      } else {
        alert(json.error || 'Failed to save splits');
      }
    } catch {
      alert('Failed to save splits');
    } finally {
      setSplitSaving(false);
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
          status: manualForm.status,
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
        setManualForm({ type: 'income', grossAmount: '', description: '', transactionDate: new Date().toISOString().slice(0, 10), status: 'Completed', categoryId: '', eventId: '', payerName: '', notes: '' });
        fetchTransactions();
      }
    } catch (err) {
      console.error('Create failed:', err);
    }
  };

  const handleSync = async (provider: 'square' | 'paypal') => {
    setSyncProvider(provider);
    setShowSync(true);
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/fin/transactions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, startDate, endDate }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncResult(json.data);
        fetchTransactions();
      } else {
        alert(json.error || `Failed to sync ${provider}`);
        setShowSync(false);
      }
    } catch (err) {
      console.error('Sync failed:', err);
      alert(`Sync failed. Check that ${provider} credentials are configured.`);
      setShowSync(false);
    } finally {
      setSyncing(false);
    }
  };

  const handleZelleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }

      const header = lines[0].toLowerCase();
      const dateIdx = header.split(',').findIndex((h) => h.trim().includes('date'));
      const descIdx = header.split(',').findIndex((h) => h.trim().includes('desc') || h.trim().includes('memo') || h.trim().includes('name'));
      const amountIdx = header.split(',').findIndex((h) => h.trim().includes('amount'));

      if (dateIdx === -1 || amountIdx === -1) {
        alert('CSV must have Date and Amount columns.');
        return;
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const amount = parseFloat(cols[amountIdx]);
        if (isNaN(amount)) continue;
        rows.push({
          date: cols[dateIdx],
          description: descIdx >= 0 ? cols[descIdx] : undefined,
          amount,
          type: amount >= 0 ? 'income' as const : 'expense' as const,
        });
      }

      if (rows.length === 0) { alert('No valid rows found in CSV.'); return; }

      const res = await fetch('/api/fin/transactions/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Imported ${json.data.imported} Zelle transactions.`);
        setShowUpload(false);
        fetchTransactions();
      } else {
        alert(json.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to parse or upload CSV.');
    } finally {
      setUploading(false);
    }
  };

  const uncategorized = transactions.filter((t) => selected.has(t.id) && !t.categoryId);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Transactions"
        action={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleSync('square')} className="btn btn-primary text-sm">Sync Square</button>
            <button onClick={() => handleSync('paypal')} className="btn btn-primary text-sm">Sync PayPal</button>
            <button onClick={() => setShowUpload(true)} className="btn btn-primary text-sm">Upload Zelle CSV</button>
            <button onClick={() => setShowManual(true)} className="btn btn-primary text-sm">+ Add Transaction</button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[130px]">
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Pending">Pending</option>
          </select>
          <select value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[120px]">
            <option value="">All Sources</option>
            <option value="square">Square</option>
            <option value="paypal">PayPal</option>
            <option value="zelle">Zelle</option>
            <option value="manual">Manual</option>
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[110px]">
            <option value="">Income & Expense</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[140px]">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={eventFilter} onChange={(e) => { setEventFilter(e.target.value); setPage(1); }} className="input text-sm py-1.5 w-auto min-w-[130px]">
            <option value="">All Events</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        </div>

        {selected.size > 0 && (
          <div className="flex gap-2 mt-3 items-center pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">{selected.size} selected</span>
            {uncategorized.length > 0 && (
              <button onClick={() => setShowClassify(true)} className="btn btn-outline text-sm py-1">
                Categorize ({uncategorized.length})
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
              <SortableHeader field="transactionDate" label="Date" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Description</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Source</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Category</th>
              <SortableHeader field="grossAmount" label="Gross" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
              <SortableHeader field="fee" label="Fees" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
              <SortableHeader field="netAmount" label="Net" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
              <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Status</th>
              <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="p-8 text-center text-gray-400">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={10} className="p-8 text-center text-gray-400">No transactions found</td></tr>
            ) : transactions.map((txn) => {
              const gross = Number(txn.grossAmount);
              const fee = Number(txn.fee);
              const net = Number(txn.netAmount);
              const isUncategorized = !txn.categoryId;
              const hasSplits = txn.splits.length > 0;
              return (
                <tr key={txn.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${txn.excluded ? 'opacity-50' : ''} ${isUncategorized ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(txn.id)} onChange={() => toggleSelect(txn.id)} className="accent-primary-600" />
                  </td>
                  <td className="p-3 whitespace-nowrap">{new Date(txn.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="p-3 max-w-[250px]">
                    <div className="truncate">{txn.description || txn.payerName || '--'}</div>
                    {hasSplits && (
                      <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                        Split: {txn.splits.map((s) => `${s.category?.name || s.accountName || '?'}: ${formatCurrency(Number(s.amount))}`).join(' | ')}
                      </div>
                    )}
                    {txn.excluded && <span className="text-xs text-gray-400 ml-1">(excluded from reports)</span>}
                  </td>
                  <td className="p-3 capitalize">{txn.provider}</td>
                  <td className="p-3">{txn.category?.name || <span className="text-yellow-600">Uncategorized</span>}</td>
                  <td className={`p-3 text-right font-semibold ${txn.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {txn.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(gross))}
                  </td>
                  <td className="p-3 text-right text-orange-600 dark:text-orange-400">
                    {fee > 0 ? `-${formatCurrency(fee)}` : '--'}
                  </td>
                  <td className={`p-3 text-right font-semibold ${txn.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {txn.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(net))}
                  </td>
                  <td className="p-3 text-center">
                    <StatusBadge status={txn.status} />
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {!hasSplits ? (
                        <button
                          onClick={() => handleOpenSplit(txn)}
                          className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          title="Split this transaction into multiple categories"
                        >
                          Split
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenSplit(txn)}
                            className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            title="Edit splits"
                          >
                            Edit Split
                          </button>
                          <button
                            onClick={() => handleRemoveSplits(txn.id)}
                            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            title="Remove all splits"
                          >
                            Unsplit
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleToggleExclude(txn)}
                        className={`text-xs px-2 py-0.5 rounded ${txn.excluded ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
                        title={txn.excluded ? 'Include in reports' : 'Exclude from reports'}
                      >
                        {txn.excluded ? 'Include' : 'Exclude'}
                      </button>
                      {txn.provider === 'manual' && (
                        <button onClick={() => handleDelete(txn.id)} className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500">Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-outline text-xs py-1 px-3">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn btn-outline text-xs py-1 px-3">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Classify Modal */}
      <Modal open={showClassify} onClose={() => setShowClassify(false)} title="Categorize Transactions">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Assign a category to {uncategorized.length} selected transaction{uncategorized.length !== 1 ? 's' : ''}.
        </p>
        <label className="block text-sm font-medium mb-1">Category</label>
        <select value={classifyCatId} onChange={(e) => setClassifyCatId(e.target.value)} className="input w-full mb-3">
          <option value="">-- Select category --</option>
          <optgroup label="Income">
            {categories.filter((c) => c.type === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Expense">
            {categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <option value="income">Income (money received)</option>
          <option value="expense">Expense (money paid out)</option>
        </select>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select value={manualForm.status} onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })} className="input w-full mb-3">
          <option value="Completed">Completed</option>
          <option value="Pending">Pending</option>
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
            {categories.filter((c) => c.type === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Expense">
            {categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {/* Upload Zelle CSV Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Zelle CSV">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Upload a CSV file from Zelle. We&apos;ll import the transactions as completed entries.
        </p>
        <label className="block text-sm font-medium mb-1">CSV File</label>
        <input ref={fileInputRef} type="file" accept=".csv" className="input w-full mb-2" />
        <p className="text-xs text-gray-400 mb-4">Expected columns: Date, Description/Memo/Name, Amount. Positive = income, negative = expense.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowUpload(false)} className="btn btn-outline">Cancel</button>
          <button onClick={handleZelleUpload} disabled={uploading} className="btn btn-primary">
            {uploading ? 'Uploading...' : 'Upload & Import'}
          </button>
        </div>
      </Modal>

      {/* Sync Modal */}
      <Modal open={showSync} onClose={() => setShowSync(false)} title={`Sync ${syncProvider === 'square' ? 'Square' : 'PayPal'} Transactions`}>
        {syncing ? (
          <div className="text-center py-6">
            <div className="text-sm text-gray-500 mb-2">Importing transactions from {syncProvider === 'square' ? 'Square' : 'PayPal'}...</div>
            <div className="text-xs text-gray-400">Date range: {startDate} to {endDate}</div>
          </div>
        ) : syncResult ? (
          <div className="py-2">
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-green-600">{syncResult.imported}</div>
              <div className="text-sm text-gray-500">new transactions imported</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm text-center mb-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="font-semibold">{syncResult.total}</div>
                <div className="text-xs text-gray-500">found in {syncProvider === 'square' ? 'Square' : 'PayPal'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="font-semibold">{syncResult.skipped}</div>
                <div className="text-xs text-gray-500">unchanged</div>
              </div>
              {(syncResult.updated ?? 0) > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <div className="font-semibold text-blue-600">{syncResult.updated}</div>
                  <div className="text-xs text-blue-500">amounts corrected</div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowSync(false)} className="btn btn-primary text-sm">Done</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Split Transaction Modal */}
      <Modal open={showSplit} onClose={() => setShowSplit(false)} title="Split Transaction" size="lg">
        {splitTxn && (
          <div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Transaction</span>
                <span className="font-semibold">{splitTxn.description || splitTxn.payerName || '--'}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">Total Amount</span>
                <span className="font-semibold">{formatCurrency(Math.abs(Number(splitTxn.grossAmount)))}</span>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {splitRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-gray-500 mb-0.5">Category</label>
                    <select
                      value={row.categoryId}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[idx] = { ...next[idx], categoryId: e.target.value };
                        setSplitRows(next);
                      }}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="">-- Select --</option>
                      <optgroup label="Income">
                        {categories.filter((c) => c.type === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                      <optgroup label="Expense">
                        {categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="block text-xs text-gray-500 mb-0.5">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[idx] = { ...next[idx], amount: e.target.value };
                        setSplitRows(next);
                      }}
                      className="input w-full text-sm py-1.5"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-gray-500 mb-0.5">Notes</label>
                    <input
                      value={row.notes}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[idx] = { ...next[idx], notes: e.target.value };
                        setSplitRows(next);
                      }}
                      className="input w-full text-sm py-1.5"
                      placeholder="Optional"
                    />
                  </div>
                  {splitRows.length > 2 && (
                    <button
                      onClick={() => setSplitRows(splitRows.filter((_, i) => i !== idx))}
                      className="mt-5 text-red-500 hover:text-red-700 text-sm px-1"
                      title="Remove row"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setSplitRows([...splitRows, { categoryId: '', amount: '', notes: '' }])}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
            >
              + Add another split
            </button>

            <div className={`p-3 rounded text-sm mb-4 ${Math.abs(splitRemaining) <= 0.01 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'}`}>
              <div className="flex justify-between">
                <span>Split total:</span>
                <span className="font-semibold">{formatCurrency(splitTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span className="font-semibold">{formatCurrency(Math.abs(splitRemaining))}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSplit(false)} className="btn btn-outline">Cancel</button>
              <button
                onClick={handleSaveSplit}
                disabled={splitSaving || Math.abs(splitRemaining) > 0.01}
                className="btn btn-primary"
              >
                {splitSaving ? 'Saving...' : 'Save Splits'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
