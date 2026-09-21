'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import QRCodeCard from '@/components/ui/QRCodeCard';
import { formatDate, formatCurrency, parseAmount, todayCST } from '@/lib/utils';
import { parseItemCatalog, parseFormConfig } from '@/lib/event-config';
import { describeRefundOutcome, combineRefundOutcomes } from '@/lib/refund-outcome';
import type { ItemConfig, FormFieldConfig, RefundOutcome } from '@/types';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineHome,
  HiOutlineClipboardDocumentList,
  HiOutlineCheckCircle,
  HiOutlinePencilSquare,
  HiOutlineUserGroup,
  HiOutlineBanknotes,
  HiOutlineTicket,
  HiOutlineXCircle,
  HiOutlineDocumentArrowDown,
  HiOutlineIdentification,
  HiOutlineArrowTrendingUp,
} from 'react-icons/hi2';

interface ItemSelection {
  id: string;
  itemId: string;
  itemName: string;
  quantity: string;
  priceCharged: string;
  status: string;
  refundedAmount: string;
  customFieldResponses?: string;
  entryTypeKey?: string;
  participantNames?: string;
}

interface EntryParticipantAnswer {
  name: string;
  fields?: Record<string, string>;
}

interface Participant {
  id: string;
  name: string;
  age: string;
  checkedInAt: string;
}

interface Registration {
  id: string;
  memberId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  registrantType: string;
  attendeeCount: string;
  totalPrice: string;
  baseRegistrationFee: string;
  paymentStatus: string;
  paymentMethod: string;
  transactionId: string;
  registrationStatus: string;
  createdAt: string;
  customFieldResponses?: string;
  emailConsent?: string;
  mediaConsent?: string;
  participants: Participant[];
  itemSelections: ItemSelection[];
}

interface EventInfo {
  id: string;
  name: string;
  date: string;
  status: string;
}

function registrationStatusBadge(status: string) {
  const s = status || 'confirmed';
  if (s === 'cancelled') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 line-through">Cancelled</span>;
  }
  if (s === 'waitlist') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Waitlist</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Confirmed</span>;
}

function paymentBadge(r: Registration) {
  if (r.paymentStatus === 'paid') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" title={r.transactionId || ''}>
        Paid{r.paymentMethod ? ` (${r.paymentMethod})` : ''}
      </span>
    );
  }
  return <span className="text-xs text-gray-400 dark:text-gray-500">Unpaid</span>;
}

export default function ItemsEventDetail({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  // The Item/EntryType catalog — fetched alongside stats so the detail modal
  // can resolve field ids (itemName/entryTypeKey/participantFields) to their
  // admin-configured labels instead of showing raw JSON keys.
  const [catalogItems, setCatalogItems] = useState<ItemConfig[]>([]);
  // The registration-level "Additional Information" questions (formConfig) —
  // fetched alongside the catalog so the detail modal/CSV can label answers
  // instead of only having them buried in customFieldResponses field ids.
  const [formConfig, setFormConfig] = useState<FormFieldConfig[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  // getStats computes these off the shared financial ledger (FinRawTransaction),
  // keyed by eventId/eventName — that works the same regardless of
  // registrationModel, unlike its participant-based attendance numbers
  // (which assume the legacy EventParticipant table and don't apply here).
  const [financials, setFinancials] = useState({ totalIncome: 0, totalExpenses: 0, netBalance: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Registration | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, regsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/stats`),
        fetch(`/api/events/${eventId}/items-registrations`),
      ]);
      const statsJson = await statsRes.json();
      if (statsJson.success && statsJson.data?.event) {
        const e = statsJson.data.event as Record<string, string>;
        setEvent({ id: e.id, name: e.name, date: e.date, status: e.status });
        setCatalogItems(parseItemCatalog(e.items).items);
        setFormConfig(parseFormConfig(e.formConfig || ''));
        setFinancials({
          totalIncome: statsJson.data.totalIncome || 0,
          totalExpenses: statsJson.data.totalExpenses || 0,
          netBalance: statsJson.data.netBalance || 0,
        });
      }
      const regsJson = await regsRes.json();
      if (regsJson.success) setRegistrations(regsJson.data);
      else toast.error(regsJson.error || 'Failed to load registrations');
    } catch {
      toast.error('Failed to load registrations');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Keep the open detail modal's data fresh after a cancel/check-in action.
  useEffect(() => {
    if (!detailItem) return;
    const fresh = registrations.find((r) => r.id === detailItem.id);
    setDetailItem(fresh || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations]);

  const active = registrations.filter((r) => r.registrationStatus !== 'cancelled');
  const cancelled = registrations.filter((r) => r.registrationStatus === 'cancelled').length;
  const waitlisted = active.filter((r) => r.registrationStatus === 'waitlist').length;
  const totalRevenue = active.reduce((sum, r) => sum + parseAmount(r.totalPrice), 0);
  const totalAttendees = active.reduce((sum, r) => sum + r.participants.length, 0);
  const totalCheckins = active.reduce((sum, r) => sum + r.participants.filter((p) => p.checkedInAt).length, 0);
  const paidCount = active.filter((r) => r.paymentStatus === 'paid').length;
  const totalUnpaid = active.reduce((sum, r) => sum + (r.paymentStatus === 'paid' ? 0 : parseAmount(r.totalPrice)), 0);

  const showRefundToast = (outcome: RefundOutcome, subjectLabel: string) => {
    const { message, tone } = describeRefundOutcome(outcome, subjectLabel);
    if (tone === 'success') toast.success(message);
    else if (tone === 'error') toast.error(message, { duration: 8000 });
    else toast(message, { icon: '⚠️', duration: 8000 });
  };

  const handleCancelItem = async (registrationId: string, itemSelectionId: string) => {
    if (confirming !== itemSelectionId) { setConfirming(itemSelectionId); return; }
    setConfirming(null);
    setBusy(itemSelectionId);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${registrationId}/items/${itemSelectionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by admin' }),
      });
      const json = await res.json();
      if (json.success) { showRefundToast(json.data.outcome, 'Item'); await load(); }
      else toast.error(json.error || 'Failed to cancel item');
    } catch {
      toast.error('Failed to cancel item');
    } finally {
      setBusy(null);
    }
  };

  const handleCancelRegistration = async (registrationId: string) => {
    if (confirming !== registrationId) { setConfirming(registrationId); return; }
    setConfirming(null);
    setBusy(registrationId);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${registrationId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by admin' }),
      });
      const json = await res.json();
      if (json.success) { showRefundToast(combineRefundOutcomes(json.data.outcomes || []), 'Registration'); await load(); }
      else toast.error(json.error || 'Failed to cancel registration');
    } catch {
      toast.error('Failed to cancel registration');
    } finally {
      setBusy(null);
    }
  };

  const handleCheckin = async (registrationId: string, participantId: string) => {
    setBusy(participantId);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations/${registrationId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId }),
      });
      const json = await res.json();
      if (json.success) { toast.success('Checked in'); load(); }
      else toast.error(json.error || 'Failed to check in');
    } catch {
      toast.error('Failed to check in');
    } finally {
      setBusy(null);
    }
  };

  // Registration-level export only — one row per registration, no per-item
  // or per-participant detail (that lives in exportParticipantsExcel below).
  // Keeping these two grains separate is what makes both files readable:
  // mixing them produced the old single-blob "Performers" column.
  const exportCsv = () => {
    const headers = [
      'Name', 'Email', 'Phone', 'Type', 'Registrant Type', 'Attendees', 'Items',
      'Amount', 'Payment Status', 'Payment Method', 'Status', 'Checked In', 'Registered At', 'Email Consent', 'Media Consent',
      ...formConfig.map((f) => f.label),
    ];
    const rows = registrations.map((r) => {
      const activeSelections = r.itemSelections.filter((s) => s.status !== 'cancelled');
      const itemsSummary = activeSelections.map((s) => `${s.itemName}${parseInt(s.quantity, 10) > 1 ? ` x${s.quantity}` : ''}`).join('; ');
      const attendeeNames = r.participants.map((p) => p.name).filter(Boolean).join('; ');
      const checkedIn = r.participants.filter((p) => p.checkedInAt).length;
      let regAnswers: Record<string, string> = {};
      if (r.customFieldResponses) {
        try { regAnswers = JSON.parse(r.customFieldResponses); } catch { /* ignore */ }
      }
      return [
        `"${(r.contactName || '').replace(/"/g, '""')}"`,
        `"${(r.contactEmail || '').replace(/"/g, '""')}"`,
        `"${(r.contactPhone || '').replace(/"/g, '""')}"`,
        r.memberId ? 'Member' : 'Guest',
        `"${(r.registrantType || '').replace(/"/g, '""')}"`,
        `"${(attendeeNames || r.attendeeCount || '').replace(/"/g, '""')}"`,
        `"${itemsSummary.replace(/"/g, '""')}"`,
        r.totalPrice || '0',
        r.paymentStatus || '',
        r.paymentMethod || '',
        r.registrationStatus || 'confirmed',
        `${checkedIn}/${r.participants.length}`,
        r.createdAt || '',
        r.emailConsent === 'false' ? 'Opted out' : 'Opted in',
        r.mediaConsent === 'true' ? 'Granted' : 'Not granted',
        ...formConfig.map((f) => `"${(regAnswers[f.id] || '').replace(/"/g, '""')}"`),
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event?.name || 'event').replace(/[^a-zA-Z0-9]/g, '_')}_registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  interface ParticipantExportRow {
    registeredBy: string;
    email: string;
    item: string;
    entryType: string;
    participantName: string;
    extraFields: Record<string, string>;
    itemNotes: string;
    amount: number;
    status: string;
    registeredAt: string;
  }

  // Union of every participant-field label an Activity entry type asks
  // beyond the first (identity) field — e.g. "Age" — plus 'Age' always,
  // since a General Attendance roster entry carries an age natively even
  // with no Activity item configured. Matched by label (not field id) so
  // entry types across different items that both ask "Age" share one column.
  const buildParticipantExtraLabels = (): string[] => {
    const labels = ['Age'];
    for (const item of catalogItems) {
      if (!item.isActivity) continue;
      for (const et of item.entryTypes || []) {
        for (const f of (et.participantFields || []).slice(1)) {
          if (!labels.includes(f.label)) labels.push(f.label);
        }
      }
    }
    return labels;
  };

  // One row per named participant per entry — the fix for the old export's
  // single lumped "Performers" text blob. Participant identity is always
  // the entry's own first participant field (see ItemsRegisterClient's
  // nameField convention), so it's never re-listed among the extra columns.
  const exportParticipantsExcel = async () => {
    const extraLabels = buildParticipantExtraLabels();
    const rows: ParticipantExportRow[] = [];
    for (const r of registrations) {
      if (r.registrationStatus === 'cancelled') continue;
      for (const p of r.participants) {
        if (!p.name.trim()) continue;
        const extraFields: Record<string, string> = {};
        if (p.age) extraFields['Age'] = p.age;
        rows.push({
          registeredBy: r.contactName, email: r.contactEmail, item: 'General Attendance', entryType: '',
          participantName: p.name, extraFields, itemNotes: '', amount: 0,
          status: r.registrationStatus || 'confirmed', registeredAt: r.createdAt,
        });
      }
      for (const sel of r.itemSelections) {
        if (sel.status === 'cancelled') continue;
        const catalogItem = catalogItems.find((it) => it.id === sel.itemId);
        const entryType = sel.entryTypeKey ? catalogItem?.entryTypes?.find((et) => et.key === sel.entryTypeKey) : undefined;
        let itemNotes = '';
        if (sel.customFieldResponses && catalogItem) {
          try {
            const cf = JSON.parse(sel.customFieldResponses);
            itemNotes = catalogItem.customFields
              .map((f) => (cf[f.id] ? `${f.label}: ${cf[f.id]}` : null))
              .filter(Boolean)
              .join('; ');
          } catch { /* ignore */ }
        }
        // Activity entries carry their own named participants (participantNames).
        // A Standard item (e.g. a flat membership/guest fee) has no
        // participant-identity field at all in the schema — its only "who" is
        // the registration's own contactName — so without this fallback it
        // silently contributed zero rows here, leaving no trace of a paid,
        // active item selection in the export at all.
        if (!sel.participantNames) {
          rows.push({
            registeredBy: r.contactName, email: r.contactEmail, item: sel.itemName, entryType: '',
            participantName: r.contactName, extraFields: {}, itemNotes, amount: parseFloat(sel.priceCharged || '0'),
            status: r.registrationStatus || 'confirmed', registeredAt: r.createdAt,
          });
          continue;
        }
        let answers: EntryParticipantAnswer[] = [];
        try { answers = JSON.parse(sel.participantNames); } catch { continue; }
        for (const a of answers) {
          const extraFields: Record<string, string> = {};
          for (const f of (entryType?.participantFields || []).slice(1)) {
            if (a.fields?.[f.id]) extraFields[f.label] = a.fields[f.id];
          }
          rows.push({
            registeredBy: r.contactName, email: r.contactEmail, item: sel.itemName, entryType: entryType?.label || '',
            participantName: a.name, extraFields, itemNotes, amount: parseFloat(sel.priceCharged || '0'),
            status: r.registrationStatus || 'confirmed', registeredAt: r.createdAt,
          });
        }
      }
    }

    const { downloadExcel } = await import('@/lib/excel-export');
    const columns = [
      { header: 'Registered By', value: (row: ParticipantExportRow) => row.registeredBy },
      { header: 'Email', value: (row: ParticipantExportRow) => row.email },
      { header: 'Item', value: (row: ParticipantExportRow) => row.item },
      { header: 'Entry Type', value: (row: ParticipantExportRow) => row.entryType },
      { header: 'Participant Name', value: (row: ParticipantExportRow) => row.participantName },
      ...extraLabels.map((label) => ({ header: label, value: (row: ParticipantExportRow) => row.extraFields[label] || '' })),
      { header: 'Item Notes', width: 30, value: (row: ParticipantExportRow) => row.itemNotes },
      { header: 'Amount', value: (row: ParticipantExportRow) => row.amount },
      { header: 'Status', value: (row: ParticipantExportRow) => row.status },
      { header: 'Registered At', value: (row: ParticipantExportRow) => (row.registeredAt ? formatDate(row.registeredAt) : '') },
    ];
    await downloadExcel(`${(event?.name || 'event').replace(/[^a-zA-Z0-9]/g, '_')}_participants.xlsx`, 'Participants', columns, rows);
  };

  const rows = registrations.map((r) => ({ ...r, type: r.memberId ? 'Member' : 'Guest' }));

  const columns: Column<Registration & { type: string }>[] = [
    { key: 'contactName', header: 'Contact', sortable: true, filterable: true, render: (item) => (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900 dark:text-gray-100">{item.contactName}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{item.contactEmail}</span>
        {item.contactPhone && <span className="text-xs text-gray-500 dark:text-gray-400">{item.contactPhone}</span>}
      </div>
    )},
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Member', 'Guest'], render: (item) => <StatusBadge status={item.type} /> },
    { key: 'itemSelections', header: 'Items', render: (item) => {
      const activeSelections = item.itemSelections.filter((s) => s.status !== 'cancelled');
      if (activeSelections.length === 0) return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate" title={activeSelections.map((s) => s.itemName).join(', ')}>
          {activeSelections.map((s) => `${s.itemName}${parseInt(s.quantity, 10) > 1 ? ` x${s.quantity}` : ''}`).join(', ')}
        </div>
      );
    }},
    { key: 'participants', header: 'Attendees', render: (item) => (
      <div className="text-sm">
        <span className="text-gray-600 dark:text-gray-400">👥 {item.participants.length || item.attendeeCount}</span>
        {item.participants.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate" title={item.participants.map((p) => p.name).join(', ')}>
            {item.participants.map((p) => p.name).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
    )},
    { key: 'totalPrice', header: 'Amount', sortable: true, sortFn: (a, b) => parseAmount(a.totalPrice) - parseAmount(b.totalPrice), render: (item) => {
      const price = parseAmount(item.totalPrice);
      return price > 0 ? <span className="text-sm font-medium">{formatCurrency(price)}</span> : <span className="text-xs text-gray-400 dark:text-gray-500">Free</span>;
    }},
    { key: 'paymentStatus', header: 'Payment', render: (item) => paymentBadge(item) },
    { key: 'registrationStatus', header: 'Status', sortable: true, filterable: true, filterOptions: ['confirmed', 'waitlist', 'cancelled'], render: (item) => registrationStatusBadge(item.registrationStatus) },
    { key: 'checkedIn', header: 'Checked In', render: (item) => {
      const checkedIn = item.participants.filter((p) => p.checkedInAt).length;
      return item.participants.length === 0 ? (
        <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
      ) : (
        <span className={`text-sm ${checkedIn === item.participants.length ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
          {checkedIn}/{item.participants.length}
        </span>
      );
    }},
    { key: 'actions', header: 'Actions', render: (item) => (
      <button onClick={() => setDetailItem(item)} className="text-primary-600 hover:text-primary-700 text-xs font-medium">
        Manage
      </button>
    )},
  ];

  if (loading) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;

  return (
    <>
      <PageHeader
        title={event?.name || 'Event Dashboard'}
        description={event ? `${formatDate(event.date)} — ${event.status === 'Upcoming' && event.date === todayCST() ? 'Today' : event.status}` : ''}
        action={
          <Link href="/event-management" className="btn-secondary flex items-center gap-2" title="Back to Events">
            <HiOutlineArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        }
      />

      {/* Quick Access Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <a href={`/events/${eventId}/home`} target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <HiOutlineHome className="w-4 h-4" /> Event Home
        </a>
        <a href={`/events/${eventId}/register`} target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <HiOutlineClipboardDocumentList className="w-4 h-4" /> Registration Page
        </a>
        <a href={`/events/${eventId}/checkin`} target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <HiOutlineCheckCircle className="w-4 h-4" /> Check-in Page
        </a>
        <Link href={`/event-management/${eventId}/items-config`} className="btn-secondary flex items-center gap-2 text-sm">
          <HiOutlinePencilSquare className="w-4 h-4" /> Edit Event
        </Link>
        <button onClick={exportCsv} className="btn-secondary flex items-center gap-2 text-sm" title="Download registrations as CSV">
          <HiOutlineDocumentArrowDown className="w-4 h-4" /> Registration CSV
        </button>
        <button onClick={exportParticipantsExcel} className="btn-secondary flex items-center gap-2 text-sm" title="Download one row per participant as Excel">
          <HiOutlineDocumentArrowDown className="w-4 h-4" /> Participants Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column -- 3/4 */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard title="Pre-Registered" value={String(active.length)} icon={<HiOutlineTicket className="w-5 h-5" />} tooltip="Total registrations before event day" />
            <StatCard title="Checked In" value={String(totalCheckins)} icon={<HiOutlineCheckCircle className="w-5 h-5" />} tooltip="Total attendees checked in at the event" />
            {waitlisted > 0 && (
              <StatCard title="Waitlisted" value={String(waitlisted)} icon={<HiOutlineTicket className="w-5 h-5" />} tooltip="Registrations on the waitlist" trend="down" />
            )}
            {cancelled > 0 && (
              <StatCard title="Cancelled" value={String(cancelled)} icon={<HiOutlineXCircle className="w-5 h-5" />} tooltip="Cancelled registrations" />
            )}
            <StatCard title="Reg. Headcount" value={String(totalAttendees)} icon={<HiOutlineIdentification className="w-5 h-5" />} tooltip="Total participants across registrations" />
            <StatCard title="Actual Headcount" value={String(totalCheckins)} icon={<HiOutlineArrowTrendingUp className="w-5 h-5" />} tooltip="Total participants actually checked in" />
          </div>

          <div className="flex justify-end mb-2">
            <Link href={`/accounting?eventId=${eventId}`} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              View full financial breakdown &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <StatCard title="Total Income" value={formatCurrency(financials.totalIncome)} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="All income tagged to this event: registrations, sponsorships, and manual entries" trend={financials.totalIncome > 0 ? 'up' : undefined} />
            <StatCard title="Expenses" value={formatCurrency(financials.totalExpenses)} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="Total expenses for this event" trend={financials.totalExpenses > 0 ? 'down' : undefined} />
            <StatCard title="Net" value={formatCurrency(financials.netBalance)} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="Total income minus expenses" trend={financials.netBalance >= 0 ? 'up' : 'down'} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Registration Revenue" value={formatCurrency(totalRevenue)} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="Revenue collected specifically from paid registrations" trend={totalRevenue > 0 ? 'up' : undefined} />
            <StatCard title="Unpaid" value={formatCurrency(totalUnpaid)} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="Outstanding amount from unpaid registrations" trend={totalUnpaid > 0 ? 'down' : undefined} />
            <StatCard title="Paid" value={`${paidCount} of ${active.length}`} icon={<HiOutlineBanknotes className="w-5 h-5" />} tooltip="Number of registrations that have paid" />
            <StatCard title="Attendees" value={String(totalAttendees)} icon={<HiOutlineUserGroup className="w-5 h-5" />} />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Registrations</h2>
            <DataTable columns={columns} data={rows} emptyMessage="No registrations yet" onRowClick={(item) => setDetailItem(item)} />
          </div>
        </div>

        {/* Right column -- 1/4 */}
        <div className="space-y-6">
          {origin && (
            <QRCodeCard
              url={`${origin}/events/${eventId}/home`}
              title="Event QR Code"
              subtitle="Scan to visit the event page"
            />
          )}

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Event Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{event?.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Date</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{event ? formatDate(event.date) : ''}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                <dd><StatusBadge status={event && event.status === 'Upcoming' && event.date === todayCST() ? 'Today' : (event?.status || '')} /></dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Registration Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{detailItem.contactName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{detailItem.contactEmail}{detailItem.contactPhone ? ` · ${detailItem.contactPhone}` : ''}</p>
              </div>
              {registrationStatusBadge(detailItem.registrationStatus)}
            </div>

            <div className="space-y-4">
              {formConfig.length > 0 && (() => {
                let answers: Record<string, string> = {};
                if (detailItem.customFieldResponses) {
                  try { answers = JSON.parse(detailItem.customFieldResponses); } catch { /* ignore */ }
                }
                const answered = formConfig.filter((f) => answers[f.id]);
                if (answered.length === 0) return null;
                return (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Additional Information</h4>
                    <div className="space-y-1">
                      {answered.map((f) => (
                        <div key={f.id} className="flex items-start gap-2 text-sm">
                          <span className="text-gray-500 dark:text-gray-400 shrink-0">{f.label}:</span>
                          <span className="text-gray-700 dark:text-gray-300">{answers[f.id]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Attendees</h4>
                {detailItem.participants.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No named attendees recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {detailItem.participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-gray-700 dark:text-gray-300">{p.name}{p.age ? ` (${p.age})` : ''}</span>
                        {p.checkedInAt ? (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Checked in</span>
                        ) : detailItem.registrationStatus !== 'cancelled' ? (
                          <button onClick={() => handleCheckin(detailItem.id, p.id)} disabled={busy === p.id} className="text-xs text-primary-600 hover:text-primary-700">
                            Check in
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Items</h4>
                <div className="space-y-1">
                  {parseAmount(detailItem.baseRegistrationFee) > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-700 dark:text-gray-300">Base Registration Fee</span>
                      <span className="text-gray-500 dark:text-gray-400">{formatCurrency(parseAmount(detailItem.baseRegistrationFee))}</span>
                    </div>
                  )}
                  {detailItem.itemSelections.map((sel) => {
                    const catalogItem = catalogItems.find((it) => it.id === sel.itemId);
                    const entryType = sel.entryTypeKey ? catalogItem?.entryTypes?.find((et) => et.key === sel.entryTypeKey) : undefined;
                    let entryParticipants: EntryParticipantAnswer[] = [];
                    if (sel.participantNames) {
                      try { entryParticipants = JSON.parse(sel.participantNames); } catch { /* ignore */ }
                    }
                    let entryCustomFields: Record<string, string> = {};
                    if (sel.customFieldResponses) {
                      try { entryCustomFields = JSON.parse(sel.customFieldResponses); } catch { /* ignore */ }
                    }
                    return (
                      <div key={sel.id}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`flex-1 ${sel.status === 'cancelled' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                            {sel.itemName}{entryType ? ` (${entryType.label})` : ''}{parseInt(sel.quantity, 10) > 1 ? ` × ${sel.quantity}` : ''}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">{formatCurrency(parseAmount(sel.priceCharged))}</span>
                          {sel.status !== 'cancelled' && detailItem.registrationStatus !== 'cancelled' && (
                            confirming === sel.id ? (
                              <span className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => handleCancelItem(detailItem.id, sel.id)} disabled={busy === sel.id} className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
                                  {busy === sel.id && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                  {busy === sel.id ? 'Cancelling…' : 'Confirm'}
                                </button>
                                {busy !== sel.id && (
                                  <button onClick={() => setConfirming(null)} className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-medium">
                                    Undo
                                  </button>
                                )}
                              </span>
                            ) : (
                              <button onClick={() => setConfirming(sel.id)} disabled={busy === sel.id} className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-medium flex items-center gap-1 shrink-0">
                                <HiOutlineXCircle className="w-3.5 h-3.5" /> Cancel
                              </button>
                            )
                          )}
                        </div>
                        {entryParticipants.length > 0 && (
                          <div className="ml-3 mt-0.5 space-y-0.5">
                            {entryParticipants.map((p, i) => {
                              const answers = (entryType?.participantFields || [])
                                .map((f) => (p.fields?.[f.id] ? `${f.label}: ${p.fields[f.id]}` : null))
                                .filter(Boolean);
                              return (
                                <p key={i} className="text-xs text-gray-500 dark:text-gray-400">
                                  • {p.name}{answers.length > 0 ? ` — ${answers.join(', ')}` : ''}
                                </p>
                              );
                            })}
                          </div>
                        )}
                        {catalogItem && catalogItem.customFields.length > 0 && Object.keys(entryCustomFields).length > 0 && (
                          <div className="ml-3 mt-0.5 space-y-0.5">
                            {catalogItem.customFields.map((f) => (
                              entryCustomFields[f.id] ? (
                                <p key={f.id} className="text-xs text-gray-500 dark:text-gray-400">{f.label}: {entryCustomFields[f.id]}</p>
                              ) : null
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 pt-3">
                  {detailItem.paymentMethod ? `Paid via ${detailItem.paymentMethod}` : 'Unpaid'} · {detailItem.paymentStatus || 'n/a'}
                </span>
                {detailItem.registrationStatus !== 'cancelled' && (
                  <span className="pt-2">
                    {confirming === detailItem.id ? (
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => handleCancelRegistration(detailItem.id)} disabled={busy === detailItem.id} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
                          {busy === detailItem.id && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                          {busy === detailItem.id ? 'Cancelling…' : 'Confirm Cancellation'}
                        </button>
                        {busy !== detailItem.id && (
                          <button onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-medium">
                            Undo
                          </button>
                        )}
                      </span>
                    ) : (
                      <button onClick={() => setConfirming(detailItem.id)} disabled={busy === detailItem.id} className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-semibold">
                        Cancel Entire Registration
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setDetailItem(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
