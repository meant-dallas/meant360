'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/utils';

interface Transaction {
  id: string;
  provider: string;
  type: string;
  grossAmount: string;
  description: string | null;
  transactionDate: string;
  reconciled: boolean;
  category: { name: string } | null;
}

interface ReconGroup {
  id: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  transactions: Transaction[];
}

export default function BankMatchingPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'unmatched' | 'matched' | 'all'>('unmatched');
  const [stats, setStats] = useState({ unmatched: 0, matched: 0, groups: 0 });
  const [groups, setGroups] = useState<ReconGroup[]>([]);
  const [showGroups, setShowGroups] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (filter === 'unmatched') params.set('reconciled', 'false');
      if (filter === 'matched') params.set('reconciled', 'true');

      const res = await fetch(`/api/fin/transactions?${params}`);
      const json = await res.json();
      if (json.success) setTransactions(json.data.data);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/fin/overview');
      const json = await res.json();
      if (json.success) setStats(json.data.reconciliationStats);
    } catch {}
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedTotal = transactions
    .filter((t) => selected.has(t.id))
    .reduce((sum, t) => sum + Number(t.grossAmount), 0);
  const isBalanced = selected.size >= 2 && Math.abs(selectedTotal) < 0.01;

  const handleConfirmMatch = async () => {
    if (!isBalanced) return;
    try {
      const res = await fetch('/api/fin/reconciliation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: Array.from(selected) }),
      });
      const json = await res.json();
      if (json.success) {
        setSelected(new Set());
        fetchTransactions();
        fetchStats();
      } else {
        alert(json.error || 'Failed to create match');
      }
    } catch (err) {
      console.error('Match failed:', err);
    }
  };

  const handleSuggest = async () => {
    const bankTxns = transactions.filter((t) => selected.has(t.id) && t.provider === 'bank');
    if (bankTxns.length !== 1) {
      alert('Select exactly one bank deposit to get suggestions.');
      return;
    }
    try {
      const res = await fetch('/api/fin/reconciliation/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: bankTxns[0].id }),
      });
      const json = await res.json();
      if (json.success && json.data.suggestedIds.length > 0) {
        const newSelected = new Set(selected);
        json.data.suggestedIds.forEach((id: string) => newSelected.add(id));
        setSelected(newSelected);
      } else {
        alert('No matching transactions found. Try selecting manually.');
      }
    } catch (err) {
      console.error('Suggest failed:', err);
    }
  };

  const handleViewGroups = async () => {
    try {
      const res = await fetch('/api/fin/reconciliation/groups');
      const json = await res.json();
      if (json.success) {
        setGroups(json.data);
        setShowGroups(true);
      }
    } catch {}
  };

  const handleUndoGroup = async (groupId: string) => {
    if (!confirm('Undo this match? Transactions will be un-verified.')) return;
    try {
      const res = await fetch('/api/fin/reconciliation/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconcileGroupId: groupId }),
      });
      const json = await res.json();
      if (json.success) {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        fetchTransactions();
        fetchStats();
      }
    } catch {}
  };

  return (
    <div>
      <PageHeader
        title="Bank Matching"
        description="Match payments from Square/PayPal to your bank deposits to confirm money arrived."
        action={
          <button onClick={handleViewGroups} className="btn btn-outline text-sm">View Match History</button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Unmatched" value={String(stats.unmatched)} className={stats.unmatched > 0 ? 'border-l-4 border-yellow-400' : ''} />
        <StatCard title="Matched" value={String(stats.matched)} className="border-l-4 border-green-400" />
        <StatCard title="Match Groups" value={String(stats.groups)} />
      </div>

      {/* Info */}
      <div className="card p-4 mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>How it works:</strong> Select a bank deposit and the payments that make it up. When the amounts balance to $0.00, you can confirm the match.
        </p>
      </div>

      {/* Selection Summary */}
      {selected.size > 0 && (
        <div className={`card p-4 mb-4 flex flex-wrap items-center gap-4 ${isBalanced ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-red-300 bg-red-50 dark:bg-red-900/20'} border`}>
          <div>
            <div className="font-semibold text-sm">{selected.size} transaction{selected.size !== 1 ? 's' : ''} selected</div>
            <div className="text-xs text-gray-500">Payments + fees + bank deposit</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className="text-xs text-gray-500">Running Total</div>
            <div className={`text-xl font-bold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(selectedTotal)}
            </div>
            {!isBalanced && <div className="text-xs text-red-500">Off by {formatCurrency(Math.abs(selectedTotal))}</div>}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSuggest} className="btn btn-outline text-sm">Auto-Suggest</button>
            <button onClick={handleConfirmMatch} disabled={!isBalanced} className="btn btn-primary text-sm">Confirm Match</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="card p-4 mb-4">
        <div className="flex gap-3 items-center">
          <select value={filter} onChange={(e) => { setFilter(e.target.value as 'unmatched' | 'matched' | 'all'); setSelected(new Set()); }} className="input text-sm py-1.5 w-auto min-w-[150px]">
            <option value="unmatched">Unmatched Only</option>
            <option value="matched">Matched Only</option>
            <option value="all">All Transactions</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="p-3 text-left w-10"><input type="checkbox" onChange={() => {
                if (selected.size === transactions.length) setSelected(new Set());
                else setSelected(new Set(transactions.map((t) => t.id)));
              }} /></th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Date</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Description</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Source</th>
              <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Type</th>
              <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Amount</th>
              <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">No transactions found</td></tr>
            ) : transactions.map((txn) => {
              const amount = Number(txn.grossAmount);
              const isSelected = selected.has(txn.id);
              return (
                <tr key={txn.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isSelected ? (isBalanced ? 'bg-green-50 dark:bg-green-900/10' : 'bg-blue-50 dark:bg-blue-900/10') : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(txn.id)} className="accent-primary-600" /></td>
                  <td className="p-3 whitespace-nowrap">{new Date(txn.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="p-3 max-w-[250px] truncate">{txn.description || '--'}</td>
                  <td className="p-3 capitalize">{txn.provider}</td>
                  <td className="p-3 capitalize">{txn.type}</td>
                  <td className={`p-3 text-right font-semibold ${amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {amount >= 0 ? '+' : ''}{formatCurrency(amount)}
                  </td>
                  <td className="p-3 text-center">
                    {txn.reconciled
                      ? <span className="text-green-600 font-semibold">&#10003;</span>
                      : <span className="text-gray-300">&#9679;</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Match Groups History */}
      {showGroups && (
        <div className="card p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Match History</h3>
            <button onClick={() => setShowGroups(false)} className="btn btn-outline text-xs">Hide</button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No match groups yet.</p>
          ) : groups.map((group) => {
            const total = group.transactions.reduce((s, t) => s + Number(t.grossAmount), 0);
            return (
              <div key={group.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">Match Group #{group.id.slice(-6)}</div>
                  <button onClick={() => handleUndoGroup(group.id)} className="text-xs text-red-500 hover:text-red-700">Undo</button>
                </div>
                {group.transactions.map((t) => (
                  <div key={t.id} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span>{t.description || t.provider} ({t.type})</span>
                    <span className={Number(t.grossAmount) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(Number(t.grossAmount))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm pt-2 border-t-2 border-gray-300 dark:border-gray-600 mt-1">
                  <span>Total</span>
                  <span className={Math.abs(total) < 0.01 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
