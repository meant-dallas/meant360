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
import PaymentOptionsSection from '@/components/events/PaymentOptionsSection';
import DiscountsForm from '@/components/events/DiscountsForm';
import ActivitiesConfigurator from '@/components/events/ActivitiesConfigurator';
import FormFieldConfigurator from '@/components/events/FormFieldConfigurator';
import { formatDate, todayCST } from '@/lib/utils';
import { useYear } from '@/contexts/YearContext';
import { DEFAULT_PRICING_RULES, parsePricingRules } from '@/lib/pricing';
import { DEFAULT_GUEST_POLICY, DEFAULT_EVENT_PAYMENT_CONFIG, parseGuestPolicy, parseFormConfig, parseActivities, parseActivityPricingMode, parseActivityMaxSlots, parseActivityMode, serializeActivities } from '@/lib/event-config';
import type { PricingRules, GuestPolicy, FormFieldConfig, ActivityConfig, ActivityPricingMode, ActivityMode, EventPaymentConfig } from '@/types';
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
  HiOutlineDocumentDuplicate,
} from 'react-icons/hi2';

interface EventRecord {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  category: string;
  pricingRules: string;
  formConfig: string;
  activities: string;
  activityPricingMode: string;
  guestPolicy: string;
  registrationOpen: string;
  capacity: string;
  capacityMode: string;
  showOnPortal: string;
  customEmailMessage: string;
  selfServiceEditEnabled: string;
  cancelRefundEnabled: string;
}

interface EmailCategory {
  name: string;
  email: string;
}

const emptyForm = {
  name: '',
  date: todayCST(),
  description: '',
  status: 'Upcoming' as 'Upcoming' | 'Completed' | 'Cancelled',
  category: '',
  registrationOpen: 'true',
  capacity: 0,
  capacityMode: 'per_registration' as string,
  showOnPortal: 'true',
  customEmailMessage: '',
  selfServiceEditEnabled: 'false',
  cancelRefundEnabled: 'false',
};

// Uppercase eyebrow label used to separate the modal into logical groups.
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
      {children}
    </h2>
  );
}

export default function EventsPage() {
  const { data: session } = useSession();
  const { year } = useYear();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'committee';
  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pricing, setPricing] = useState<PricingRules>({ ...DEFAULT_PRICING_RULES });
  const [guestPolicy, setGuestPolicy] = useState<GuestPolicy>({ ...DEFAULT_GUEST_POLICY });
  const [paymentConfig, setPaymentConfig] = useState<EventPaymentConfig>({ ...DEFAULT_EVENT_PAYMENT_CONFIG });
  const [formConfig, setFormConfig] = useState<FormFieldConfig[]>([]);
  const [eventActivities, setEventActivities] = useState<ActivityConfig[]>([]);
  const [actPricingMode, setActPricingMode] = useState<ActivityPricingMode>('flat');
  const [activityMode, setActivityMode] = useState<ActivityMode>('performance');
  const [activityMaxSlots, setActivityMaxSlots] = useState<number | undefined>(undefined);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [emailCategories, setEmailCategories] = useState<EmailCategory[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events?year=${year}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchRecords();
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success && json.data) {
          const cats = JSON.parse(json.data['email_categories'] || '[]');
          if (Array.isArray(cats)) setEmailCategories(cats);
        }
      } catch { /* ignore */ }
    })();
  }, [fetchRecords]);

  const fetchPaymentConfig = async (eventId: string) => {
    try {
      const res = await fetch(`/api/events/${eventId}/payment-config`);
      const json = await res.json();
      if (json.success && json.data) setPaymentConfig(json.data);
    } catch { /* keep default */ }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPricing({ ...DEFAULT_PRICING_RULES });
    setGuestPolicy({ ...DEFAULT_GUEST_POLICY });
    setPaymentConfig({ ...DEFAULT_EVENT_PAYMENT_CONFIG });
    setFormConfig([]);
    setEventActivities([]);
    setActPricingMode('flat');
    setActivityMode('performance');
    setActivityMaxSlots(undefined);
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
      category: record.category || '',
      registrationOpen: record.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
      capacity: parseInt(record.capacity || '0', 10) || 0,
      capacityMode: record.capacityMode || 'per_registration',
      showOnPortal: record.showOnPortal?.toLowerCase() === 'false' ? '' : 'true',
      customEmailMessage: record.customEmailMessage || '',
      selfServiceEditEnabled: record.selfServiceEditEnabled?.toLowerCase() === 'true' ? 'true' : 'false',
      cancelRefundEnabled: record.cancelRefundEnabled?.toLowerCase() === 'true' ? 'true' : 'false',
    });
    setPricing(parsePricingRules(record.pricingRules));
    setGuestPolicy(parseGuestPolicy(record.guestPolicy || ''));
    setPaymentConfig({ ...DEFAULT_EVENT_PAYMENT_CONFIG });
    setFormConfig(parseFormConfig(record.formConfig || ''));
    setEventActivities(parseActivities(record.activities || ''));
    setActPricingMode(parseActivityPricingMode(record.activityPricingMode || ''));
    setActivityMode(parseActivityMode(record.activities || ''));
    setActivityMaxSlots(parseActivityMaxSlots(record.activities || ''));
    setExpandedSections({});
    setModalOpen(true);
    fetchPaymentConfig(record.id);
  };

  const openDuplicate = (record: EventRecord) => {
    setEditing(null);
    setForm({
      name: `${record.name} (Copy)`,
      date: record.date,
      description: record.description,
      status: 'Upcoming',
      category: record.category || '',
      registrationOpen: record.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
      capacity: parseInt(record.capacity || '0', 10) || 0,
      capacityMode: record.capacityMode || 'per_registration',
      showOnPortal: record.showOnPortal?.toLowerCase() === 'false' ? '' : 'true',
      customEmailMessage: record.customEmailMessage || '',
      // Not carried over from the original — a duplicate meant for testing
      // starts with these off; enable explicitly on the copy.
      selfServiceEditEnabled: 'false',
      cancelRefundEnabled: 'false',
    });
    setPricing(parsePricingRules(record.pricingRules));
    setGuestPolicy(parseGuestPolicy(record.guestPolicy || ''));
    setPaymentConfig({ ...DEFAULT_EVENT_PAYMENT_CONFIG });
    setFormConfig(parseFormConfig(record.formConfig || ''));
    setEventActivities(parseActivities(record.activities || ''));
    setActPricingMode(parseActivityPricingMode(record.activityPricingMode || ''));
    setActivityMode(parseActivityMode(record.activities || ''));
    setActivityMaxSlots(parseActivityMaxSlots(record.activities || ''));
    setExpandedSections({});
    setModalOpen(true);
    fetchPaymentConfig(record.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Event name is required'); return; }
    if (!paymentConfig.paypalEnabled && !paymentConfig.zelleEnabled) {
      toast.error('Enable at least one payment option (PayPal or Zelle)');
      return;
    }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const pricingRules = JSON.stringify(pricing);
      const guestPolicyJson = JSON.stringify(guestPolicy);
      const formConfigJson = formConfig.length > 0 ? JSON.stringify(formConfig) : '';
      const activitiesJson = serializeActivities(eventActivities, activityMaxSlots, activityMode);
      // Ticketed events are always priced per-tier — the flat/per-activity
      // toggle only applies to (and is only shown for) Performance mode.
      const effectiveActivityPricingMode = activityMode === 'ticketed_event' ? 'per_activity' : actPricingMode;
      const body = editing
        ? { ...form, id: editing.id, pricingRules, guestPolicy: guestPolicyJson, formConfig: formConfigJson, activities: activitiesJson, activityPricingMode: eventActivities.length > 0 ? effectiveActivityPricingMode : '', registrationOpen: form.registrationOpen, capacity: form.capacity, capacityMode: form.capacityMode, showOnPortal: form.showOnPortal || '' }
        : { ...form, pricingRules, guestPolicy: guestPolicyJson, formConfig: formConfigJson, activities: activitiesJson, activityPricingMode: eventActivities.length > 0 ? effectiveActivityPricingMode : '', registrationOpen: form.registrationOpen, capacity: form.capacity, capacityMode: form.capacityMode, showOnPortal: form.showOnPortal || '' };
      const res = await fetch('/api/events', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        const eventId = editing ? editing.id : json.data?.id;
        if (eventId) {
          await fetch(`/api/events/${eventId}/payment-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentConfig),
          });
        }
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
    { key: 'status', header: 'Status', sortable: true, filterable: true, filterOptions: ['Upcoming', 'Completed', 'Cancelled'], render: (item) => {
      const today = todayCST();
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
          <Link href={`/event-management/${item.id}`} onClick={(e) => e.stopPropagation()} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Event Dashboard">
            <HiOutlineChartBarSquare className="w-4 h-4" />
          </Link>
          {canEdit && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openDuplicate(item); }} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded" title="Duplicate Event">
                <HiOutlineDocumentDuplicate className="w-4 h-4" />
              </button>
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

  // Sort by date descending, then split into active vs completed
  const sortedRecords = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const activeEvents = sortedRecords.filter((r) => r.status !== 'Completed');
  const completedEvents = sortedRecords.filter((r) => r.status === 'Completed');

  return (
    <>
      <PageHeader
        title="Events"
        description="Manage events used across all financial modules"
        action={
          canEdit ? (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <HiOutlinePlus className="w-4 h-4" /> Add Event
            </button>
          ) : undefined
        }
      />

      <DataTable columns={columns} data={activeEvents} loading={loading} emptyMessage="No upcoming events" />

      {completedEvents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3">Completed Events</h2>
          <DataTable columns={columns} data={completedEvents} emptyMessage="No completed events" />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Event' : 'Add Event'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ============ Basic Info ============ */}
          <div className="space-y-4">
            <GroupLabel>Basic Info</GroupLabel>
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
                <label className="label">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
                  <option value="">None</option>
                  {emailCategories.map((cat) => (
                    <option key={cat.name} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ============ Registration Settings ============ */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <GroupLabel>Registration Settings</GroupLabel>

            {/* Registration Open Toggle */}
            <div className="flex items-start gap-3">
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

            {/* Show on Member Portal Toggle */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="showOnPortal"
                checked={form.showOnPortal?.toLowerCase() === 'true'}
                onChange={(e) => setForm({ ...form, showOnPortal: e.target.checked ? 'true' : 'false' })}
                className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="showOnPortal" className="cursor-pointer">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Show on Member Portal</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">When unchecked, this event will not appear in the member portal&apos;s upcoming events</p>
              </label>
            </div>

            {/* Self-Service Registration Edit Toggle */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="selfServiceEditEnabled"
                checked={form.selfServiceEditEnabled?.toLowerCase() === 'true'}
                onChange={(e) => setForm({ ...form, selfServiceEditEnabled: e.target.checked ? 'true' : 'false' })}
                className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="selfServiceEditEnabled" className="cursor-pointer">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Allow Self-Service Registration Edit</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Lets registrants edit their own registration from the event page.</p>
              </label>
            </div>

            {/* Cancel Refund Toggle */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="cancelRefundEnabled"
                checked={form.cancelRefundEnabled?.toLowerCase() === 'true'}
                onChange={(e) => setForm({ ...form, cancelRefundEnabled: e.target.checked ? 'true' : 'false' })}
                className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="cancelRefundEnabled" className="cursor-pointer">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto-Refund on Cancellation</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically refunds PayPal/Square payments when a registrant cancels.</p>
              </label>
            </div>

            {/* Event Capacity */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Event Capacity</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={form.capacity === 0 ? '' : form.capacity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setForm({ ...form, capacity: isNaN(val) || val < 0 ? 0 : val });
                      }}
                      className="input"
                      placeholder="0 = Unlimited"
                    />
                    {form.capacity === 0 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                        Unlimited
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="label">Count By</label>
                  <div className="space-y-1.5 pt-1">
                    {[
                      { value: 'per_registration', label: 'Per Registration (family)' },
                      { value: 'per_adult', label: 'Per Adult' },
                      { value: 'per_kid', label: 'Per Kid' },
                    ].map(({ value, label }) => {
                      const modes = form.capacityMode.split(',');
                      const checked = modes.includes(value);
                      return (
                        <label key={value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (value === 'per_registration') {
                                setForm({ ...form, capacityMode: e.target.checked ? 'per_registration' : 'per_adult' });
                              } else {
                                const current = form.capacityMode.split(',').filter((m) => m !== 'per_registration');
                                const next = e.target.checked
                                  ? (current.includes(value) ? current : [...current, value])
                                  : current.filter((m) => m !== value);
                                setForm({ ...form, capacityMode: next.length > 0 ? next.join(',') : 'per_registration' });
                              }
                            }}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {form.capacity ? (
                  form.capacityMode === 'per_adult'
                    ? `Max ${form.capacity} adults. Only the adult count input will be shown during registration.`
                    : form.capacityMode === 'per_kid'
                      ? `Max ${form.capacity} kids. Only the kid count input will be shown during registration.`
                      : form.capacityMode === 'per_adult,per_kid' || form.capacityMode === 'per_kid,per_adult'
                        ? `Max ${form.capacity} people (adults + kids each count as 1). Both adult and kid inputs will be shown.`
                        : `Max ${form.capacity} registrations (each family counts as 1). Additional registrations go to waitlist.`
                ) : 'No attendee limit — anyone can register without restrictions.'}
              </p>
            </div>
          </div>

          {/* ============ Activities & Tickets ============ */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button type="button" onClick={() => toggleSection('activities')} className="flex items-center justify-between w-full">
              <GroupLabel>Activities &amp; Tickets</GroupLabel>
              <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.activities ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.activities && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="label">Event Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="activityMode"
                        value="performance"
                        checked={activityMode === 'performance'}
                        onChange={() => setActivityMode('performance')}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Performance</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="activityMode"
                        value="ticketed_event"
                        checked={activityMode === 'ticketed_event'}
                        onChange={() => {
                          setActivityMode('ticketed_event');
                          // Tickets are sold per-person — default capacity to counting
                          // each adult/kid rather than per-family, matching how tiers
                          // are actually assigned. Also drop any per-activity slot cap,
                          // since Event Capacity is now the single source of truth
                          // (Max Tickets is hidden below in this mode).
                          setForm((prev) => ({ ...prev, capacityMode: 'per_adult,per_kid' }));
                          setActivityMaxSlots(undefined);
                        }}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Ticketed Event</span>
                    </label>
                  </div>
                  {activityMode === 'ticketed_event' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Registrants pick one ticket tier per attendee already entered earlier in registration — no separate name entry, no chest numbers.
                    </p>
                  )}
                </div>
                {activityMode === 'performance' && (
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
                )}
                <ActivitiesConfigurator
                  activities={eventActivities}
                  activityPricingMode={actPricingMode}
                  maxSlots={activityMaxSlots}
                  mode={activityMode}
                  onChange={setEventActivities}
                  onMaxSlotsChange={setActivityMaxSlots}
                />
              </div>
            )}
          </div>

          {/* ============ Pricing & Payment ============ */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <GroupLabel>Pricing & Payment</GroupLabel>

            {activityMode !== 'ticketed_event' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Member Policy</h3>
                  <MemberPolicyForm pricing={pricing} onChange={setPricing} />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Guest Policy</h3>
                  <GuestPolicySection pricing={pricing} guestPolicy={guestPolicy} onPricingChange={setPricing} onPolicyChange={setGuestPolicy} />
                </div>
              </>
            )}

            <div>
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

            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Payment Options</h3>
              <PaymentOptionsSection paymentConfig={paymentConfig} onChange={setPaymentConfig} />
            </div>
          </div>

          {/* ============ Advanced ============ */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <GroupLabel>Advanced</GroupLabel>

            <div>
              <label className="label">Custom Email Message <span className="text-xs font-normal text-gray-400">(optional)</span></label>
              <textarea
                value={form.customEmailMessage}
                onChange={(e) => setForm({ ...form, customEmailMessage: e.target.value })}
                className="input"
                rows={3}
                placeholder="Add a message to include in registration & check-in emails. Supports basic formatting: **bold**, *italic*, [link text](url), and line breaks."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use **bold**, *italic*, [link text](url) for formatting. Line breaks are preserved.
              </p>
            </div>

            <div>
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
