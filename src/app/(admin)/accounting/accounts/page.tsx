'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';

interface Account {
  id: string;
  name: string;
  openingBalance: string;
  notes: string | null;
  sortOrder: number;
  transfersIn: number;
  currentBalance: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', openingBalance: '', notes: '' });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fin/accounts');
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await fetch('/api/fin/accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editId,
            name: form.name,
            openingBalance: parseFloat(form.openingBalance) || 0,
            notes: form.notes || undefined,
          }),
        });
      } else {
        await fetch('/api/fin/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            openingBalance: parseFloat(form.openingBalance) || 0,
            notes: form.notes || undefined,
            sortOrder: accounts.length,
          }),
        });
      }
      setShowAdd(false);
      setEditId(null);
      setForm({ name: '', openingBalance: '', notes: '' });
      fetchAccounts();
    } catch {}
  };

  const handleEdit = (acc: Account) => {
    setForm({ name: acc.name, openingBalance: String(acc.openingBalance), notes: acc.notes || '' });
    setEditId(acc.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this account?')) return;
    try {
      await fetch('/api/fin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchAccounts();
    } catch {}
  };

  const totalOpeningBalance = accounts.reduce((sum, a) => sum + Number(a.openingBalance), 0);
  const totalCurrentBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalTransfers = accounts.reduce((sum, a) => sum + a.transfersIn, 0);

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Manage your bank accounts and opening balances."
        action={
          <button onClick={() => { setForm({ name: '', openingBalance: '', notes: '' }); setEditId(null); setShowAdd(true); }} className="btn btn-primary text-sm">
            + Add Account
          </button>
        }
      />

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : accounts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500 mb-4">No accounts yet. Add your bank accounts to track balances.</p>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">Add Your First Account</button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="card p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Opening Balance</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalOpeningBalance)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Transfers In</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">+{formatCurrency(totalTransfers)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Current Balance</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalCurrentBalance)}</div>
              </div>
            </div>
          </div>

          {/* Account List */}
          <div className="card">
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {accounts.map((acc) => (
                <div key={acc.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-lg text-gray-900 dark:text-gray-100">{acc.name}</div>
                      {acc.notes && <div className="text-xs text-gray-500 mt-0.5">{acc.notes}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(acc)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200">Edit</button>
                      <button onClick={() => handleDelete(acc.id)} className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200">Delete</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Opening Balance</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(Number(acc.openingBalance))}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Transfers In</div>
                      <div className="font-semibold text-blue-600 dark:text-blue-400">+{formatCurrency(acc.transfersIn)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Current Balance</div>
                      <div className="font-bold text-lg text-green-600 dark:text-green-400">{formatCurrency(acc.currentBalance)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? 'Edit Account' : 'Add Account'}>
        <label className="block text-sm font-medium mb-1">Account Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full mb-3" placeholder="e.g., Checking Account, Savings, CD (Reserve)" />
        <label className="block text-sm font-medium mb-1">Opening Balance</label>
        <input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input w-full mb-4" rows={2} placeholder="Bank name, account number last 4, etc." />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim()} className="btn btn-primary">{editId ? 'Update' : 'Create'}</button>
        </div>
      </Modal>
    </div>
  );
}
