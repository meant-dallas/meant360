'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import { NEW_CATEGORY_BUCKETS, CATEGORY_BUCKET_LABELS, CATEGORY_BUCKET_DESCRIPTIONS, CATEGORY_BUCKET_COLORS } from '@/lib/fin-category-buckets';

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'income' });

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fin/categories');
      const json = await res.json();
      if (json.success) setCategories(json.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await fetch('/api/fin/categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, name: form.name, type: form.type }),
        });
      } else {
        await fetch('/api/fin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      setShowAdd(false);
      setEditId(null);
      setForm({ name: '', type: 'income' });
      fetchCategories();
    } catch {}
  };

  const handleEdit = (cat: Category) => {
    setForm({ name: cat.name, type: cat.type });
    setEditId(cat.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? It cannot be deleted if transactions use it.')) return;
    try {
      const res = await fetch('/api/fin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Cannot delete');
      fetchCategories();
    } catch {}
  };

  const BUCKETS = NEW_CATEGORY_BUCKETS.map((type) => ({
    type,
    label: CATEGORY_BUCKET_LABELS[type],
    color: CATEGORY_BUCKET_COLORS[type],
    description: CATEGORY_BUCKET_DESCRIPTIONS[type],
  }));

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Manage categories and which of the four buckets (Income, Expense, Refund, Reimbursement) each one belongs to."
        action={
          <button onClick={() => { setForm({ name: '', type: 'income' }); setEditId(null); setShowAdd(true); }} className="btn btn-primary text-sm">
            + Add Category
          </button>
        }
      />

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {BUCKETS.map((bucket) => {
            const bucketCategories = categories.filter((c) => c.type === bucket.type);
            return (
              <div key={bucket.type} className="card">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className={`font-semibold ${bucket.color}`}>{bucket.label}</h3>
                  <p className="text-xs text-gray-400 mt-1">{bucket.description}</p>
                </div>
                {bucketCategories.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No categories yet</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {bucketCategories.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-medium">{cat.name}</span>
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(cat)} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200">Edit</button>
                          <button onClick={() => handleDelete(cat.id)} className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? 'Edit Category' : 'Add Category'}>
        <label className="block text-sm font-medium mb-1">Category Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full mb-3" placeholder="e.g., Membership, Venue, Food" />
        <label className="block text-sm font-medium mb-1">Type</label>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input w-full mb-4">
          {BUCKETS.map((bucket) => <option key={bucket.type} value={bucket.type}>{bucket.label}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim()} className="btn btn-primary">{editId ? 'Update' : 'Create'}</button>
        </div>
      </Modal>
    </div>
  );
}
