'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import { analytics } from '@/lib/analytics';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import MemberPolicyForm from '@/components/events/MemberPolicyForm';
import GuestPolicySection from '@/components/events/GuestPolicySection';
import DiscountsForm from '@/components/events/DiscountsForm';
import ActivitiesConfigurator from '@/components/events/ActivitiesConfigurator';
import FormFieldConfigurator from '@/components/events/FormFieldConfigurator';
import { formatDate } from '@/lib/utils';
import { DEFAULT_PRICING_RULES, parsePricingRules } from '@/lib/pricing';
import { DEFAULT_GUEST_POLICY, parseGuestPolicy, parseFormConfig, parseActivities, parseActivityPricingMode } from '@/lib/event-config';
import type { PricingRules, GuestPolicy, FormFieldConfig, ActivityConfig, ActivityPricingMode } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineChartBarSquare,
  HiOutlineChevronDown,
  HiOutlineHome,
  HiOutlineClipboardDocumentList,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';

interface EventRecord {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  pricingRules: string;
  formConfig: string;
  activities: string;
  activityPricingMode: string;
  guestPolicy: string;
  registrationOpen: string;
}

const emptyForm = {
  name: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  status: 'Upcoming' as 'Upcoming' | 'Completed' | 'Cancelled',
  registrationOpen: 'true',
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
  const [guestPolicy, setGuestPolicy] = useState<GuestPolicy>({ ...DEFAULT_GUEST_POLICY });
  const [formConfig, setFormConfig] = useState<FormFieldConfig[]>([]);
  const [eventActivities, setEventActivities] = useState<ActivityConfig[]>([]);
  const [actPricingMode, setActPricingMode] = useState<ActivityPricingMode>('flat');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
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

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPricing({ ...DEFAULT_PRICING_RULES });
    setGuestPolicy({ ...DEFAULT_GUEST_POLICY });
    setFormConfig([]);
    setEventActivities([]);
    setActPricingMode('flat');
    setExpandedSections({});
    setModalOpen(true);
  };

  const openEdit = (record: EventRecord) => {
    setEditing(record);
    setForm({
      name: record.name,
      date: record.date,
      description: record.description,
      status: record.status as 'Upcoming' | 'Completed' | 'Cancelled',
      registrationOpen: record.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
    });
    setPricing(parsePricingRules(record.pricingRules));
    setGuestPolicy(parseGuestPolicy(record.guestPolicy || ''));
    setFormConfig(parseFormConfig(record.formConfig || ''));
    setEventActivities(parseActivities(record.activities || ''));
    setActPricingMode(parseActivityPricingMode(record.activityPricingMode || ''));
    setExpandedSections({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Event name is required'); return; }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const pricingRules = JSON.stringify(pricing);
      const guestPolicyJson = JSON.stringify(guestPolicy);
      const formConfigJson = formConfig.length > 0 ? JSON.stringify(formConfig) : '';
      const activitiesJson = eventActivities.length > 0 ? JSON.stringify(eventActivities) : '';
      const body = editing
        ? { ...form, id: editing.id, pricingRules, guestPolicy: guestPolicyJson, formConfig: formConfigJson, activities: activitiesJson, activityPricingMode: eventActivities.length > 0 ? actPricingMode : '', registrationOpen: form.registrationOpen }
        : { ...form, pricingRules, guestPolicy: guestPolicyJson, formConfig: formConfigJson, activities: activitiesJson, activityPricingMode: eventActivities.length > 0 ? actPricingMode : '', registrationOpen: form.registrationOpen };
      const res = await fetch('/api/events', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? 'Event updated' : 'Event created');
        if (!editing) {
          analytics.eventCreated(form.name);
        } else {
          analytics.eventRegistrationToggled(editing.id, form.registrationOpen?.toLowerCase() === 'true');
        }
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

  const columns: Column<EventRecord>[] = [
    { key: 'name', header: 'Event Name', sortable: true, filterable: true },
    { key: 'date', header: 'Date', sortable: true, render: (item) => formatDate(item.date) },
    { key: 'description', header: 'Description', sortable: true, filterable: true },
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Upcoming', 'Completed', 'Cancelled'], render: (item) => {
      const today = new Date().toISOString().split('T')[0];
      const displayStatus = item.status === 'Upcoming' && item.date === today ? 'Today' : item.status;
      return <StatusBadge status={displayStatus} />;
    }},
    {
      key: 'actions', header: '',
      render: (item) => (
        <div className="flex items-center gap-1">
          <a href={`/events/${item.id}/home`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Event Home Page">
            <HiOutlineHome className="w-4 h-4" />
          </a>
          <a href={`/events/${item.id}/register`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Registration Page">
            <HiOutlineClipboardDocumentList className="w-4 h-4" />
          </a>
          <a href={`/events/${item.id}/checkin`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Check-in Page">
            <HiOutlineCheckCircle className="w-4 h-4" />
          </a>
          <Link href={`/settings/events/${item.id}`} onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Event Dashboard">
            <HiOutlineChartBarSquare className="w-4 h-4" />
          </Link>
          {isAdmin && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEdit(item); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Edit Event">
                <HiOutlinePencil className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded" title="Delete Event">
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
          </div>

          {/* Registration Open Toggle */}
          <div className="flex items-start gap-3 pt-2">
            <input
              type="checkbox"
              id="registrationOpen"
              checked={form.registrationOpen?.toLowerCase() === 'true'}
              onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked ? 'true' : '' })}
              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="registrationOpen" className="cursor-pointer">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Registration Open</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">When unchecked, users cannot register even if status is &quot;Upcoming&quot;</p>
            </label>
          </div>

          {/* Member Policy */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Member Policy</h3>
            <MemberPolicyForm pricing={pricing} onChange={setPricing} />
          </div>

          {/* Guest Policy */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Guest Policy</h3>
            <GuestPolicySection pricing={pricing} guestPolicy={guestPolicy} onPricingChange={setPricing} onPolicyChange={setGuestPolicy} />
          </div>

          {/* Discounts */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button type="button" onClick={() => toggleSection('discounts')} className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discounts</h3>
              <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.discounts ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.discounts && (
              <div className="mt-3">
                <DiscountsForm pricing={pricing} onChange={setPricing} />
              </div>
            )}
          </div>

          {/* Activities */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button type="button" onClick={() => toggleSection('activities')} className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Activities</h3>
              <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.activities ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.activities && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="label">Activity Pricing Mode</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="actPricingMode" value="flat" checked={actPricingMode === 'flat'} onChange={() => setActPricingMode('flat')} className="text-primary-600 focus:ring-primary-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Flat (included in base price)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="actPricingMode" value="per_activity" checked={actPricingMode === 'per_activity'} onChange={() => setActPricingMode('per_activity')} className="text-primary-600 focus:ring-primary-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Per activity</span>
                    </label>
                  </div>
                </div>
                <ActivitiesConfigurator activities={eventActivities} activityPricingMode={actPricingMode} onChange={setEventActivities} />
              </div>
            )}
          </div>

          {/* Custom Registration Fields */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button type="button" onClick={() => toggleSection('formFields')} className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Registration Fields</h3>
              <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.formFields ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.formFields && (
              <div className="mt-3">
                <FormFieldConfigurator fields={formConfig} onChange={setFormConfig} />
              </div>
            )}
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
