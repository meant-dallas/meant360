'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { HiOutlineArrowPath, HiOutlineTag } from 'react-icons/hi2';

interface TransactionRecord {
  id: string;
  externalId: string;
  source: string;
  amount: string;
  fee: string;
  netAmount: string;
  description: string;
  payerName: string;
  payerEmail: string;
  date: string;
  tag: string;
  eventName: string;
  syncedAt: string;
  notes: string;
}

const TAG_OPTIONS = ['Untagged', 'Membership', 'Guest Fee', 'Sponsorship', 'Event Entry', 'Donation', 'Other'];

export default function TransactionsPage() {
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [syncSource, setSyncSource] = useState<'Square' | 'PayPal'>('Square');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [events, setEvents] = useState<{ name: string }[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSource) params.set('source', filterSource);
      if (filterTag) params.set('tag', filterTag);
      const res = await fetch(`/api/finance/transactions?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [filterSource, filterTag]);

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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: syncSource,
          startDate: syncStartDate,
          endDate: syncEndDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Synced ${json.data.imported} new transactions (${json.data.skipped} duplicates skipped)`);
        setShowSyncModal(false);
        fetchRecords();
      } else {
        toast.error(json.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const updateTag = async (id: string, tag: string, eventName?: string) => {
    try {
      const body: Record<string, string> = { id, tag };
      if (eventName !== undefined) body.eventName = eventName;
      const res = await fetch('/api/finance/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Tag updated');
        fetchRecords();
      } else {
        toast.error(json.error || 'Update failed');
      }
    } catch {
      toast.error('Update failed');
    }
  };

  const columns: Column<TransactionRecord>[] = [
    { key: 'date', header: 'Date', render: (item) => formatDate(item.date) },
    {
      key: 'source', header: 'Source',
      render: (item) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          item.source === 'Square' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {item.source}
        </span>
      ),
    },
    { key: 'description', header: 'Description' },
    { key: 'payerName', header: 'Payer' },
    { key: 'amount', header: 'Amount', render: (item) => formatCurrency(parseFloat(item.amount || '0')) },
    { key: 'fee', header: 'Fee', render: (item) => item.fee && parseFloat(item.fee) > 0 ? formatCurrency(parseFloat(item.fee)) : '-' },
    { key: 'netAmount', header: 'Net', render: (item) => formatCurrency(parseFloat(item.netAmount || item.amount || '0')) },
    {
      key: 'tag', header: 'Tag',
      render: (item) => (
        <select
          value={item.tag}
          onChange={(e) => updateTag(item.id, e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      ),
    },
    {
      key: 'eventName', header: 'Event',
      render: (item) => (
        <select
          value={item.eventName}
          onChange={(e) => updateTag(item.id, item.tag, e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">None</option>
          {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
        </select>
      ),
    },
  ];

  const totalAmount = records.reduce((s, r) => s + parseFloat(r.amount || '0'), 0);

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${records.length} transactions | Total: ${formatCurrency(totalAmount)}`}
        action={
          <button onClick={() => setShowSyncModal(true)} className="btn-primary flex items-center gap-2">
            <HiOutlineArrowPath className="w-4 h-4" /> Sync Transactions
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Sources</option>
          <option value="Square">Square</option>
          <option value="PayPal">PayPal</option>
        </select>
        <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Tags</option>
          {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No transactions synced yet" />

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSyncModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Sync Transactions</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Source</label>
                <select value={syncSource} onChange={(e) => setSyncSource(e.target.value as 'Square' | 'PayPal')} className="select">
                  <option value="Square">Square</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={syncStartDate} onChange={(e) => setSyncStartDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={syncEndDate} onChange={(e) => setSyncEndDate(e.target.value)} className="input" />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Duplicate transactions will be automatically skipped based on transaction ID.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSyncModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
                  {syncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <HiOutlineArrowPath className="w-4 h-4" /> Sync Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
