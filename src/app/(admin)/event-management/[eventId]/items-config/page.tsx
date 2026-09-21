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
import { parseItemCatalog, serializeItemCatalog, DEFAULT_ITEM_CATALOG, parseFormConfig, DEFAULT_ITEMS_TERMINOLOGY } from '@/lib/event-config';
import { DEFAULT_EVENT_PAYMENT_CONFIG } from '@/lib/event-config';
import type { ItemCatalog, FormFieldConfig, EventPaymentConfig, ItemsTerminology } from '@/types';
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
  // Event Categories are managed in Settings (also used for email "From"
  // addresses) — sourced here so this event's Category field is a dropdown
  // of the same list instead of freeform text, and so the ticket theme
  // color/logo (see PublicLayout) always matches a category that actually exists.
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, paymentRes, settingsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/stats`),
        fetch(`/api/events/${eventId}/payment-config`),
        fetch('/api/settings'),
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
      const settingsJson = await settingsRes.json();
      if (settingsJson.success) {
        try {
          const cats = JSON.parse(settingsJson.data['email_categories'] || '[]') as { name: string }[];
          setCategoryOptions(cats.map((c) => c.name).filter(Boolean));
        } catch { /* ignore */ }
      }
    } catch {
      toast.error('Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Event name is required'); return; }
    if (!form.category.trim()) { toast.error('Event Category is required'); return; }
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
              <label className="label">Event Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="select">
                <option value="">Select a category…</option>
                {/* If the saved category doesn't match any configured option (e.g. renamed/removed since), keep it selectable so saving doesn't silently wipe it. */}
                {form.category && !categoryOptions.includes(form.category) && (
                  <option value={form.category}>{form.category} (not in Settings anymore)</option>
                )}
                {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Drives this event&apos;s brand color and logo. Manage the list under Settings → Event Categories.
              </p>
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
              <input type="checkbox" checked={form.showOnPortal === 'true'} onChange={(e) => setForm({ ...form, showOnPortal: e.target.checked ? 'true' : 'false' })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
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
          <div>
            <label className="label">Maximum Total Activity Slots</label>
            <input
              type="number"
              min={0}
              value={catalog.maxTotalActivitySlots ?? ''}
              onChange={(e) => setCatalog({ ...catalog, maxTotalActivitySlots: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="input"
              placeholder="Unlimited"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Ceiling across EVERY Activity item&apos;s entries combined for this event (Dance + Music + Drama + ... all count against the same number) — separate from, and enforced alongside, each Entry Type&apos;s own capacity below. Leave blank for unlimited.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={catalog.allowGuests} onChange={(e) => setCatalog({ ...catalog, allowGuests: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Allow Guest Registration</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">If off, only verified MEANT members can register — everyone else is blocked after identity verification.</p>
          {catalog.allowGuests && (
            <div>
              <label className="label">Restrict Guests to Email Domain(s)</label>
              <input
                type="text"
                value={(catalog.allowedGuestEmailDomains || []).join(', ')}
                onChange={(e) => {
                  const domains = e.target.value.split(',').map((d) => d.trim()).filter(Boolean);
                  setCatalog({ ...catalog, allowedGuestEmailDomains: domains.length > 0 ? domains : undefined });
                }}
                className="input"
                placeholder="e.g. utd.edu, utdallas.edu"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Optional — comma-separated. If set, only guest emails ending in one of these domains can register or check in (subdomains count too, e.g. &quot;utd.edu&quot; also allows &quot;cs.utd.edu&quot;). Never restricts verified MEANT members. Leave blank to allow any guest email.
              </p>
            </div>
          )}
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
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Labels</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Customize the words registrants see — e.g. call an Activity a &quot;Performance&quot;, or an Item a &quot;Ticket&quot;, to match this event. Leave any field blank to use the default shown as its placeholder.
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            Check-in Button, Cancel Link, and Manage Link work differently from every other field above: they have no default text. Leaving any of them blank hides that button/link entirely instead of falling back to English — use this for event types that don&apos;t have a check-in step or a cancellable registration (e.g. a Survey).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(Object.keys(DEFAULT_ITEMS_TERMINOLOGY) as (keyof ItemsTerminology)[]).map((key) => {
              const hidesWhenBlank = HIDES_WHEN_BLANK.has(key);
              return (
                <div key={key}>
                  <label className="label">{TERMINOLOGY_FIELD_LABELS[key]}</label>
                  <input
                    type="text"
                    value={catalog.terminology?.[key] ?? ''}
                    onChange={(e) => setCatalog({ ...catalog, terminology: { ...catalog.terminology, [key]: e.target.value } })}
                    className="input"
                    placeholder={hidesWhenBlank ? 'Blank = hidden' : DEFAULT_ITEMS_TERMINOLOGY[key]}
                  />
                  <p className={`text-[11px] mt-0.5 ${hidesWhenBlank ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {hidesWhenBlank ? 'Blank hides this — ' : 'e.g. '}{TERMINOLOGY_FIELD_EXAMPLE[key]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment Options</h2>
          <PaymentOptionsSection paymentConfig={paymentConfig} onChange={setPaymentConfig} />
        </div>
      </div>
    </>
  );
}

// checkinCta/cancelLinkText/manageLinkText have no real default (see
// DEFAULT_ITEMS_TERMINOLOGY) — blank means "hide this button/link", not
// "fall back to English". Called out in red both here and in the Labels
// card's warning banner above.
const HIDES_WHEN_BLANK = new Set<keyof ItemsTerminology>(['checkinCta', 'cancelLinkText', 'manageLinkText']);

const TERMINOLOGY_FIELD_LABELS: Record<keyof ItemsTerminology, string> = {
  eventTypeNoun: 'Event (singular)',
  registrationNoun: 'Registration',
  itemNoun: 'Item (singular)',
  itemNounPlural: 'Item (plural)',
  activityNoun: 'Activity (singular)',
  activityNounPlural: 'Activity (plural)',
  entryNoun: 'Entry (singular)',
  entryNounPlural: 'Entry (plural)',
  participantNoun: 'Participant (singular)',
  participantNounPlural: 'Participant (plural)',
  actionVerb: 'Action Verb',
  registerCta: 'Register Button',
  checkinCta: 'Check-in Button',
  cancelLinkText: 'Cancel Link Text',
  manageLinkText: 'Manage Link Text',
};

// Worked examples showing the FULL resulting phrase each word feeds into —
// so an admin changing "Participant" -> "Performer" can see up front that it
// also changes "Add Another Performer", not just an isolated label somewhere.
const TERMINOLOGY_FIELD_EXAMPLE: Record<keyof ItemsTerminology, string> = {
  eventTypeNoun: '"Register for this Event"',
  registrationNoun: '"Your Registration is confirmed"',
  itemNoun: '"Select at least one Item to continue"',
  itemNounPlural: '"Select Items"',
  activityNoun: 'Item behavior label shown to registrants',
  activityNounPlural: 'Section heading when listing Activities',
  entryNoun: '"Entry 1", "Add Entry"',
  entryNounPlural: '"3 Entries added"',
  participantNoun: '"Add Another Participant", "Participant name"',
  participantNounPlural: '"2 Participants on this registration"',
  actionVerb: '"Register" button — try "Submit", "Book", "Purchase"',
  registerCta: 'Bottom-nav tab label',
  checkinCta: 'Bottom-nav tab + home page "Check in" card',
  cancelLinkText: 'Home page link, self-service edit OFF — whole sentence, not composed from other fields',
  manageLinkText: 'Home page link, self-service edit ON — whole sentence, not composed from other fields',
};
