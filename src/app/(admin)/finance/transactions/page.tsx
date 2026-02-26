'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { HiOutlineArrowPath } from 'react-icons/hi2';

interface UnifiedRecord {
  id: string;
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  payerPayee: string;
  eventName: string;
  source: string;
  paymentMethod: string;
  status?: string;
}

const TYPE_OPTIONS = ['Income', 'Expense', 'Reimbursement', 'Payment Sync'];

const typeBadge = (type: string) => {
  switch (type) {
    case 'Income':
      return 'bg-green-100 text-green-800';
    case 'Expense':
      return 'bg-red-100 text-red-800';
    case 'Reimbursement':
      return 'bg-yellow-100 text-yellow-800';
    case 'Payment Sync':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function TransactionsPage() {
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [syncSource, setSyncSource] = useState<'Square' | 'PayPal'>('Square');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: 'all' });
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/finance/transactions?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

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

  const columns: Column<UnifiedRecord>[] = [
    { key: 'date', header: 'Date', render: (item) => formatDate(item.date) },
    {
      key: 'type',
      header: 'Type',
      render: (item) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadge(item.type)}`}>
          {item.type}
        </span>
      ),
    },
    { key: 'category', header: 'Category' },
    {
      key: 'description',
      header: 'Description',
      render: (item) => (
        <span className="truncate max-w-[200px] block" title={item.description}>
          {item.description}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (item) => {
        const amt = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount) || '0');
        const isPositive = amt >= 0;
        return (
          <span className={isPositive ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
            {isPositive ? '+' : ''}{formatCurrency(amt)}
          </span>
        );
      },
    },
    { key: 'payerPayee', header: 'Payer / Payee' },
    { key: 'eventName', header: 'Event' },
    {
      key: 'source',
      header: 'Source',
      render: (item) => (
        <span className="text-xs text-gray-500">{item.source}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) =>
        item.status ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            item.status === 'Reimbursed' ? 'bg-green-100 text-green-800' :
            item.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
            item.status === 'Rejected' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {item.status}
          </span>
        ) : null,
    },
  ];

  const totalIncome = records.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalExpenses = records.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const net = totalIncome + totalExpenses;

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${records.length} records | Income: ${formatCurrency(totalIncome)} | Expenses: ${formatCurrency(totalExpenses)} | Net: ${formatCurrency(net)}`}
        action={
          <button onClick={() => setShowSyncModal(true)} className="btn-primary flex items-center gap-2">
            <HiOutlineArrowPath className="w-4 h-4" /> Sync Transactions
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No transactions found" />

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
