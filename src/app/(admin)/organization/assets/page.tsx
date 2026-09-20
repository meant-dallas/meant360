'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';
import { HiOutlineShieldExclamation } from 'react-icons/hi2';

interface Asset {
  id: string;
  name: string;
  category: string;
  description: string;
  value: string;
  acquiredDate: string;
  condition: string;
  location: string;
  notes: string;
  status: string;
}

const CATEGORIES = ['Equipment', 'Property', 'Vehicle', 'Furniture', 'Other'] as const;
const CONDITIONS = ['New', 'Good', 'Fair', 'Poor'] as const;
const STATUSES = ['Active', 'Disposed', 'Lost'] as const;

const emptyForm = {
  name: '', category: 'Equipment', description: '', value: '0',
  acquiredDate: '', condition: 'Good', location: '', notes: '', status: 'Active',
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assets');
      if (res.status === 403) { setForbidden(true); return; }
      const json = await res.json();
      if (json.success) setAssets(json.data);
    } catch { /* ignore — loading state just clears below */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await fetch('/api/assets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, ...form }),
        });
      } else {
        await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      setShowAdd(false);
      setEditId(null);
      setForm(emptyForm);
      fetchAssets();
    } catch { /* the list simply won't reflect the change — acceptable for this admin tool */ }
  };

  const handleEdit = (asset: Asset) => {
    setForm({
      name: asset.name, category: asset.category || 'Equipment', description: asset.description,
      value: asset.value || '0', acquiredDate: asset.acquiredDate, condition: asset.condition || 'Good',
      location: asset.location, notes: asset.notes, status: asset.status || 'Active',
    });
    setEditId(asset.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Failed to delete');
      fetchAssets();
    } catch { /* ignore */ }
  };

  const totalValue = assets.filter((a) => a.status === 'Active').reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);

  if (forbidden) {
    return (
      <div>
        <PageHeader title="Assets" description="Assets held by the association." />
        <div className="card p-8 text-center">
          <HiOutlineShieldExclamation className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Restricted to Board of Directors</p>
          <p className="text-sm text-gray-400 mt-1">Contact a Board member if you need access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Assets"
        description={`Assets held by the association.${assets.length > 0 ? ` Total active value: ${formatCurrency(totalValue)}.` : ''}`}
        action={
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowAdd(true); }} className="btn btn-primary text-sm">
            + Add Asset
          </button>
        }
      />

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : assets.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">No assets recorded yet</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Acquired</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{asset.name}</p>
                    {asset.description && <p className="text-xs text-gray-400 mt-0.5">{asset.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{asset.category || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(parseFloat(asset.value) || 0)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{asset.condition || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{asset.location || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{asset.acquiredDate ? formatDate(asset.acquiredDate) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      asset.status === 'Active' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : asset.status === 'Lost' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(asset)} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 mr-1">Edit</button>
                    <button onClick={() => handleDelete(asset.id)} className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? 'Edit Asset' : 'Add Asset'} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" placeholder="e.g., PA Sound System" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input w-full">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Value ($)</label>
            <input type="number" min={0} step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Condition</label>
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="input w-full">
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Acquired Date</label>
            <input type="date" value={form.acquiredDate} onChange={(e) => setForm({ ...form, acquiredDate: e.target.value })} className="input w-full" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input w-full" placeholder="e.g., Storage Unit, Board Member's Garage" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" rows={2} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input w-full" rows={2} />
          </div>
          {editId && (
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input w-full">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim()} className="btn btn-primary">{editId ? 'Update' : 'Create'}</button>
        </div>
      </Modal>
    </div>
  );
}
