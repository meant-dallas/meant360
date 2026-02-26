'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import PricingRulesForm from '@/components/events/PricingRulesForm';
import { formatDate } from '@/lib/utils';
import { DEFAULT_PRICING_RULES, parsePricingRules, formatPricingSummary } from '@/lib/pricing';
import type { PricingRules } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineChartBarSquare } from 'react-icons/hi2';

interface EventRecord {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  parentEventId: string;
  pricingRules: string;
}

const emptyForm = {
  name: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  status: 'Upcoming' as 'Upcoming' | 'Completed' | 'Cancelled',
  parentEventId: '',
};

export default function EventsPage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pricing, setPricing] = useState<PricingRules>({ ...DEFAULT_PRICING_RULES });
  const [saving, setSaving] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/events');
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPricing({ ...DEFAULT_PRICING_RULES });
    setModalOpen(true);
  };

  const openEdit = (record: EventRecord) => {
    setEditing(record);
    setForm({
      name: record.name,
      date: record.date,
      description: record.description,
      status: record.status as 'Upcoming' | 'Completed' | 'Cancelled',
      parentEventId: record.parentEventId || '',
    });
    setPricing(parsePricingRules(record.pricingRules));
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Event name is required'); return; }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const pricingRules = pricing.enabled ? JSON.stringify(pricing) : '';
      const body = editing
        ? { ...form, id: editing.id, pricingRules }
        : { ...form, pricingRules };
      const res = await fetch('/api/events', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? 'Event updated' : 'Event created');
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const res = await fetch(`/api/events?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Deleted'); fetchRecords(); }
      else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete failed'); }
  };

  // Helper: get parent event names for display
  const getParentName = (parentId: string) => {
    if (!parentId) return '';
    const parent = records.find((r) => r.id === parentId);
    return parent?.name || '';
  };

  // Helper: available parent events for the dropdown (no parent themselves, not current event or its sub-events)
  const parentOptions = records.filter((r) => {
    if (!r) return false;
    if (r.parentEventId) return false; // already a sub-event
    if (editing && r.id === editing.id) return false; // can't be own parent
    if (editing && r.parentEventId === editing.id) return false; // is a child of current
    return true;
  });

  const columns: Column<EventRecord>[] = [
    { key: 'name', header: 'Event Name' },
    { key: 'date', header: 'Date', render: (item) => formatDate(item.date) },
    { key: 'description', header: 'Description' },
    {
      key: 'parentEventId', header: 'Parent',
      render: (item) => {
        const name = getParentName(item.parentEventId);
        return name ? <span className="text-xs text-gray-500 dark:text-gray-400">{name}</span> : <span className="text-xs text-gray-600 dark:text-gray-300">-</span>;
      },
    },
    {
      key: 'pricingRules', header: 'Pricing',
      render: (item) => {
        const rules = parsePricingRules(item.pricingRules);
        return <span className="text-xs text-gray-500 dark:text-gray-400">{formatPricingSummary(rules)}</span>;
      },
    },
    { key: 'status', header: 'Status', render: (item) => {
      const today = new Date().toISOString().split('T')[0];
      const displayStatus = item.status === 'Upcoming' && item.date === today ? 'Today' : item.status;
      return <StatusBadge status={displayStatus} />;
    }},
    {
      key: 'actions', header: '',
      render: (item) => (
        <div className="flex items-center gap-1">
          <Link href={`/settings/events/${item.id}`} onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded">
            <HiOutlineChartBarSquare className="w-4 h-4" />
          </Link>
          {isAdmin && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded">
                <HiOutlinePencil className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded">
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Events"
        description="Manage events used across all financial modules"
        action={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Event
            </button>
          ) : undefined
        }
      />

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No events yet" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Event' : 'Add Event'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Event Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required placeholder="e.g., Annual Gala 2024" />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Upcoming' | 'Completed' | 'Cancelled' })} className="select">
                <option value="Upcoming">Upcoming</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Parent Event</label>
              <select value={form.parentEventId} onChange={(e) => setForm({ ...form, parentEventId: e.target.value })} className="select">
                <option value="">None (standalone)</option>
                {parentOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Pricing</h3>
            <PricingRulesForm pricing={pricing} onChange={setPricing} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create Event'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
