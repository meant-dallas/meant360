'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import QRCodeCard from '@/components/ui/QRCodeCard';
import { formatDate, formatCurrency, parseAmount, todayCST } from '@/lib/utils';
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
} from 'react-icons/hi2';

interface ItemSelection {
  id: string;
  itemId: string;
  itemName: string;
  quantity: string;
  priceCharged: string;
  status: string;
  refundedAmount: string;
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
  const [registrations, setRegistrations] = useState<Registration[]>([]);
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
  const cancelled = registrations.length - active.length;
  const totalRevenue = active.reduce((sum, r) => sum + parseAmount(r.totalPrice), 0);
  const totalAttendees = active.reduce((sum, r) => sum + r.participants.length, 0);
  const totalCheckins = active.reduce((sum, r) => sum + r.participants.filter((p) => p.checkedInAt).length, 0);

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
      if (json.success) { toast.success('Item cancelled and refunded'); load(); }
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
      if (json.success) { toast.success('Registration cancelled and refunded'); load(); }
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

  const exportCsv = () => {
    const headers = ['Name', 'Email', 'Phone', 'Type', 'Registrant Type', 'Attendees', 'Items', 'Amount', 'Payment Status', 'Payment Method', 'Status', 'Checked In', 'Registered At'];
    const rows = registrations.map((r) => {
      const activeSelections = r.itemSelections.filter((s) => s.status !== 'cancelled');
      const itemsSummary = activeSelections.map((s) => `${s.itemName}${parseInt(s.quantity, 10) > 1 ? ` x${s.quantity}` : ''}`).join('; ');
      const attendeeNames = r.participants.map((p) => p.name).filter(Boolean).join('; ');
      const checkedIn = r.participants.filter((p) => p.checkedInAt).length;
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column -- 3/4 */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Registrations" value={String(active.length)} icon={<HiOutlineTicket className="w-5 h-5" />} />
            <StatCard title="Attendees" value={String(totalAttendees)} icon={<HiOutlineUserGroup className="w-5 h-5" />} />
            <StatCard title="Checked In" value={String(totalCheckins)} icon={<HiOutlineCheckCircle className="w-5 h-5" />} />
            <StatCard title="Revenue" value={formatCurrency(totalRevenue)} icon={<HiOutlineBanknotes className="w-5 h-5" />} subtitle={cancelled > 0 ? `${cancelled} cancelled` : undefined} />
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
                  {detailItem.itemSelections.map((sel) => (
                    <div key={sel.id} className="flex items-center gap-2 text-sm">
                      <span className={`flex-1 ${sel.status === 'cancelled' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                        {sel.itemName}{parseInt(sel.quantity, 10) > 1 ? ` × ${sel.quantity}` : ''}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">{formatCurrency(parseAmount(sel.priceCharged))}</span>
                      {sel.status !== 'cancelled' && detailItem.registrationStatus !== 'cancelled' && (
                        confirming === sel.id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button onClick={() => handleCancelItem(detailItem.id, sel.id)} disabled={busy === sel.id} className="text-red-600 hover:text-red-700 font-medium">Confirm?</button>
                            <button onClick={() => setConfirming(null)} className="text-gray-400 hover:text-gray-600">Undo</button>
                          </span>
                        ) : (
                          <button onClick={() => handleCancelItem(detailItem.id, sel.id)} disabled={busy === sel.id} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
                            <HiOutlineXCircle className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 pt-3">
                  {detailItem.paymentMethod ? `Paid via ${detailItem.paymentMethod}` : 'Unpaid'} · {detailItem.paymentStatus || 'n/a'}
                </span>
                {detailItem.registrationStatus !== 'cancelled' && (
                  <span className="pt-3">
                    {confirming === detailItem.id ? (
                      <span className="flex items-center gap-2 text-xs">
                        <button onClick={() => handleCancelRegistration(detailItem.id)} disabled={busy === detailItem.id} className="text-red-600 hover:text-red-700 font-medium">Confirm cancel?</button>
                        <button onClick={() => setConfirming(null)} className="text-gray-400 hover:text-gray-600">Undo</button>
                      </span>
                    ) : (
                      <button onClick={() => handleCancelRegistration(detailItem.id)} disabled={busy === detailItem.id} className="text-xs text-red-600 hover:text-red-700 font-medium">
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
