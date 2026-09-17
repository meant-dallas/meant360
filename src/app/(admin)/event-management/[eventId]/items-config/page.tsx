'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import ItemsConfigurator from '@/components/events/ItemsConfigurator';
import FormFieldConfigurator from '@/components/events/FormFieldConfigurator';
import PaymentOptionsSection from '@/components/events/PaymentOptionsSection';
import DiscountsForm from '@/components/events/DiscountsForm';
import { parseItemCatalog, serializeItemCatalog, DEFAULT_ITEM_CATALOG, parseFormConfig } from '@/lib/event-config';
import { DEFAULT_EVENT_PAYMENT_CONFIG } from '@/lib/event-config';
import type { ItemCatalog, FormFieldConfig, EventPaymentConfig } from '@/types';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlineHome, HiOutlineClipboardDocumentList, HiOutlineCheckCircle } from 'react-icons/hi2';

interface EventForm {
  name: string;
  date: string;
  description: string;
  category: string;
  registrationOpen: string;
  capacity: number;
  showOnPortal: string;
  customEmailMessage: string;
  selfServiceEditEnabled: string;
  cancelRefundEnabled: string;
}

const emptyForm: EventForm = {
  name: '',
  date: '',
  description: '',
  category: '',
  registrationOpen: 'true',
  capacity: 0,
  showOnPortal: 'true',
  customEmailMessage: '',
  selfServiceEditEnabled: 'false',
  cancelRefundEnabled: 'false',
};

export default function ItemsEventConfigPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const canEdit = role === 'admin' || role === 'committee';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [catalog, setCatalog] = useState<ItemCatalog>({ ...DEFAULT_ITEM_CATALOG });
  const [formConfig, setFormConfig] = useState<FormFieldConfig[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<EventPaymentConfig>({ ...DEFAULT_EVENT_PAYMENT_CONFIG });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, paymentRes] = await Promise.all([
        fetch(`/api/events/${eventId}/stats`),
        fetch(`/api/events/${eventId}/payment-config`),
      ]);
      const statsJson = await statsRes.json();
      if (statsJson.success && statsJson.data?.event) {
        const event = statsJson.data.event as Record<string, string>;
        setForm({
          name: event.name || '',
          date: event.date || '',
          description: event.description || '',
          category: event.category || '',
          registrationOpen: event.registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
          capacity: parseInt(event.capacity || '0', 10) || 0,
          showOnPortal: event.showOnPortal?.toLowerCase() === 'false' ? '' : 'true',
          customEmailMessage: event.customEmailMessage || '',
          selfServiceEditEnabled: event.selfServiceEditEnabled?.toLowerCase() === 'true' ? 'true' : 'false',
          cancelRefundEnabled: event.cancelRefundEnabled?.toLowerCase() === 'true' ? 'true' : 'false',
        });
        setCatalog(parseItemCatalog(event.items || ''));
        setFormConfig(parseFormConfig(event.formConfig || ''));
      } else {
        toast.error('Event not found');
      }
      const paymentJson = await paymentRes.json();
      if (paymentJson.success && paymentJson.data) setPaymentConfig(paymentJson.data);
    } catch {
      toast.error('Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Event name is required'); return; }
    if (!paymentConfig.paypalEnabled && !paymentConfig.zelleEnabled) {
      toast.error('Enable at least one payment option (PayPal or Zelle)');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: eventId,
          ...form,
          capacityMode: 'per_registration',
          registrationModel: 'items',
          items: serializeItemCatalog(catalog),
          formConfig: formConfig.length > 0 ? JSON.stringify(formConfig) : '',
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetch(`/api/events/${eventId}/payment-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentConfig),
        });
        toast.success('Event saved');
      } else {
        toast.error(json.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <>
      <PageHeader
        title={form.name || 'New Event'}
        description="Configure this event's Items — rooms, tickets, activities, add-ons — and registration settings."
        action={
          <div className="flex items-center gap-2">
            <Link href="/event-management" className="btn-secondary flex items-center gap-2">
              <HiOutlineArrowLeft className="w-4 h-4" /> Back
            </Link>
            {canEdit && (
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6 text-sm">
        <a href={`/events/${eventId}/home`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
          <HiOutlineHome className="w-4 h-4" /> Event Home
        </a>
        <a href={`/events/${eventId}/register`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
          <HiOutlineClipboardDocumentList className="w-4 h-4" /> Registration Page
        </a>
        <a href={`/events/${eventId}/checkin`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
          <HiOutlineCheckCircle className="w-4 h-4" /> Check-in Page
        </a>
        <Link href={`/event-management/${eventId}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          View Dashboard →
        </Link>
      </div>

      <div className="space-y-6">
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Event Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Event Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input" placeholder="e.g. Academic, Arts, Outing" />
            </div>
            <div>
              <label className="label">Overall Registration Cap</label>
              <input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value, 10) || 0 })} className="input" placeholder="Unlimited" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Max total registrations for this event. Leave 0 for unlimited.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.registrationOpen === 'true'} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked ? 'true' : '' })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Registration Open</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.showOnPortal === 'true'} onChange={(e) => setForm({ ...form, showOnPortal: e.target.checked ? 'true' : '' })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show on Portal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.selfServiceEditEnabled === 'true'} onChange={(e) => setForm({ ...form, selfServiceEditEnabled: e.target.checked ? 'true' : 'false' })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Self-Service Edit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.cancelRefundEnabled === 'true'} onChange={(e) => setForm({ ...form, cancelRefundEnabled: e.target.checked ? 'true' : 'false' })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Self-Service Cancel &amp; Refund</span>
            </label>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Registration</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Top-level registration settings — separate from Item selection.</p>
          <div>
            <label className="label">Who Can Register</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalog.registrantTypes.includes('family')}
                  onChange={(e) => setCatalog({ ...catalog, registrantTypes: e.target.checked ? ['family'] : [] })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Family</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalog.registrantTypes.includes('adult')}
                  disabled={catalog.registrantTypes.includes('family')}
                  onChange={(e) => setCatalog({
                    ...catalog,
                    registrantTypes: e.target.checked
                      ? [...catalog.registrantTypes.filter((t) => t !== 'family'), 'adult']
                      : catalog.registrantTypes.filter((t) => t !== 'adult'),
                  })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Adult</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catalog.registrantTypes.includes('kids')}
                  disabled={catalog.registrantTypes.includes('family')}
                  onChange={(e) => setCatalog({
                    ...catalog,
                    registrantTypes: e.target.checked
                      ? [...catalog.registrantTypes.filter((t) => t !== 'family'), 'kids']
                      : catalog.registrantTypes.filter((t) => t !== 'kids'),
                  })}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Kids</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Family is exclusive of Adult/Kids. Leave all unchecked for a generic individual registration. Enable only Adult (or only Kids) for an age-restricted event.</p>
          </div>
          <div>
            <label className="label">Max Attendees per Registration</label>
            <input type="number" min={0} value={catalog.maxAttendeesPerRegistration ?? ''} onChange={(e) => setCatalog({ ...catalog, maxAttendeesPerRegistration: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="input" placeholder="Unlimited" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={catalog.allowGuests} onChange={(e) => setCatalog({ ...catalog, allowGuests: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Allow Guest Registration</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">If off, only verified MEANT members can register — everyone else is blocked after identity verification.</p>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Items</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Add the items registrants can select — rooms, tickets, activities, add-ons. Each has its own price, capacity, and custom questions. For a flat entry fee every registrant pays, add an item marked &quot;General Attendance&quot; and required.</p>
          <ItemsConfigurator items={catalog.items} onChange={(items) => setCatalog({ ...catalog, items })} />
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discounts</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Sibling discount applies per additional participant on a &quot;Per participant&quot; item (e.g. 2nd+ kid in a performance activity). Multi-event discount applies when 2+ priced items are selected in one registration. Early bird applies to the running total before a cutoff date.</p>
          <DiscountsForm pricing={catalog} onChange={(p) => setCatalog({ ...catalog, ...p })} />
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Registration Questions</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Only shown on the register page when this event has no configured Items (e.g. a Survey) — for events with Items, collect extra info as custom fields on an item instead.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Section Heading</label>
              <input
                type="text"
                value={catalog.additionalInfoHeading ?? ''}
                onChange={(e) => setCatalog({ ...catalog, additionalInfoHeading: e.target.value })}
                className="input"
                placeholder="Additional Information"
              />
            </div>
            <div>
              <label className="label">Sub-heading / Text (optional)</label>
              <input
                type="text"
                value={catalog.additionalInfoSubheading ?? ''}
                onChange={(e) => setCatalog({ ...catalog, additionalInfoSubheading: e.target.value })}
                className="input"
                placeholder="e.g. Please answer the following before you check out"
              />
            </div>
          </div>
          <FormFieldConfigurator fields={formConfig} onChange={setFormConfig} />
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment Options</h2>
          <PaymentOptionsSection paymentConfig={paymentConfig} onChange={setPaymentConfig} />
        </div>
      </div>
    </>
  );
}
