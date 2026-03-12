'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import QRCodeCard from '@/components/ui/QRCodeCard';
import { formatDate, formatCurrency } from '@/lib/utils';
import { parseActivities, parseActivityRegistrations } from '@/lib/event-config';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineIdentification,
  HiOutlineTicket,
  HiOutlineArrowLeft,
  HiOutlineBanknotes,
  HiOutlineArrowTrendingUp,
  HiOutlineHome,
  HiOutlineClipboardDocumentList,
  HiOutlineArrowTopRightOnSquare,
  HiOutlinePencilSquare,
} from 'react-icons/hi2';

interface ParticipantRecord {
  id: string;
  name: string;
  email: string;
  type: string;
  registeredAt: string;
  checkedInAt: string;
  registeredAdults: string;
  registeredKids: string;
  actualAdults: string;
  actualKids: string;
  selectedActivities: string;
  totalPrice: string;
  paymentStatus: string;
  paymentMethod: string;
  transactionId: string;
  registrationStatus: string;
}

interface EventStats {
  event: Record<string, string>;
  totalRegistrations: number;
  totalCheckins: number;
  memberCheckins: number;
  guestCheckins: number;
  walkIns: number;
  waitlisted: number;
  participants: ParticipantRecord[];
  totalExpenses: number;
}

export default function EventDashboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editTotalPrice, setEditTotalPrice] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/stats`);
      const json = await res.json();
      if (json.success) setStats(json.data);
      else toast.error(json.error || 'Failed to load stats');
    } catch {
      toast.error('Failed to fetch event stats');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openPaymentEdit = (item: ParticipantRecord) => {
    setEditingPayment(item.id);
    setEditPaymentStatus(item.paymentStatus || '');
    setEditPaymentMethod(item.paymentMethod || '');
    setEditTotalPrice(item.totalPrice || '0');
  };

  const savePayment = async () => {
    if (!editingPayment) return;
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/events/${eventId}/checkins`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: editingPayment,
          paymentStatus: editPaymentStatus,
          paymentMethod: editPaymentMethod,
          totalPrice: editTotalPrice,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Payment updated');
        setEditingPayment(null);
        fetchStats();
      } else {
        toast.error(json.error || 'Failed to update payment');
      }
    } catch {
      toast.error('Failed to update payment');
    } finally {
      setSavingPayment(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Derived data
  const registrations = stats.participants.filter((p) => p.registeredAt);
  const checkins = stats.participants.filter((p) => p.checkedInAt);
  const walkIns = stats.participants.filter((p) => p.checkedInAt && !p.registeredAt);

  // Headcount
  const safeCount = (v: string | undefined) => {
    const n = parseInt(v || '0', 10);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : 0;
  };
  const registeredHeadcount = registrations.reduce((sum, p) => sum + safeCount(p.registeredAdults) + safeCount(p.registeredKids), 0);
  const actualHeadcount = checkins.reduce((sum, p) => sum + safeCount(p.actualAdults) + safeCount(p.actualKids), 0);

  // Revenue
  const paidParticipants = stats.participants.filter((p) => p.paymentStatus === 'paid');
  const unpaidParticipants = stats.participants.filter((p) => p.paymentStatus !== 'paid' && parseFloat(p.totalPrice || '0') > 0);
  const totalRevenue = paidParticipants.reduce((sum, p) => sum + parseFloat(p.totalPrice || '0'), 0);
  const totalUnpaid = unpaidParticipants.reduce((sum, p) => sum + parseFloat(p.totalPrice || '0'), 0);
  const paidCount = paidParticipants.length;

  // Activity stats
  const activities = parseActivities(stats.event.activities || '');
  const activityCounts: Record<string, number> = {};
  if (activities.length > 0) {
    for (const p of stats.participants) {
      if (p.selectedActivities) {
        const regs = parseActivityRegistrations(p.selectedActivities);
        for (const reg of regs) {
          activityCounts[reg.activityId] = (activityCounts[reg.activityId] || 0) + 1;
        }
      }
    }
  }

  const checkinUrl = `${origin}/events/${eventId}/checkin`;
  const registerUrl = `${origin}/events/${eventId}/register`;
  const checkinColumns: Column<ParticipantRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Member', 'Guest'], render: (item) => <StatusBadge status={item.type} /> },
    { key: 'actualAdults', header: 'Adults', sortable: true, render: (item) => <span className="text-sm">{item.actualAdults || '-'}</span> },
    { key: 'actualKids', header: 'Kids', sortable: true, render: (item) => <span className="text-sm">{item.actualKids || '-'}</span> },
    { key: 'totalPrice', header: 'Price', sortable: true, sortFn: (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'), render: (item) => {
      const price = parseFloat(item.totalPrice || '0');
      return price > 0 ? <span className="text-sm">{formatCurrency(price)}</span> : <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
    }},
    { key: 'paymentStatus', header: 'Payment', render: (item) => {
      if (editingPayment === item.id) {
        return (
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <select
              value={editPaymentStatus}
              onChange={(e) => setEditPaymentStatus(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            {editPaymentStatus === 'paid' && (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editTotalPrice}
                  onChange={(e) => setEditTotalPrice(e.target.value)}
                  placeholder="Total ($)"
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                />
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Method...</option>
                  <option value="cash">Cash</option>
                  <option value="square">Square</option>
                  <option value="paypal">PayPal</option>
                  <option value="zelle">Zelle</option>
                </select>
              </>
            )}
            <div className="flex gap-1">
              <button
                onClick={savePayment}
                disabled={savingPayment}
                className="text-xs px-2 py-0.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {savingPayment ? '...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingPayment(null)}
                className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      }
      return (
        <button
          onClick={() => openPaymentEdit(item)}
          className="inline-flex items-center gap-1 group"
          title="Click to edit payment"
        >
          {item.paymentStatus === 'paid' ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
              Paid{item.paymentMethod ? ` (${item.paymentMethod})` : ''}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
          )}
          <HiOutlinePencilSquare className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      );
    }},
    { key: 'registeredAt', header: 'Pre-Reg', sortable: true, render: (item) => item.registeredAt ? <span className="text-xs text-green-600">Yes</span> : <span className="text-xs text-gray-400">Walk-in</span> },
    { key: 'checkedInAt', header: 'Checked In', sortable: true, render: (item) => formatDate(item.checkedInAt) },
  ];

  const registrationColumns: Column<ParticipantRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    { key: 'email', header: 'Email', sortable: true, filterable: true },
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Member', 'Guest'], render: (item) => <StatusBadge status={item.type} /> },
    { key: 'registeredAdults', header: 'Adults', sortable: true, render: (item) => <span className="text-sm">{item.registeredAdults || '-'}</span> },
    { key: 'registeredKids', header: 'Kids', sortable: true, render: (item) => <span className="text-sm">{item.registeredKids || '-'}</span> },
    { key: 'totalPrice', header: 'Price', sortable: true, sortFn: (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'), render: (item) => {
      const price = parseFloat(item.totalPrice || '0');
      return price > 0 ? <span className="text-sm">{formatCurrency(price)}</span> : <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
    }},
    { key: 'paymentStatus', header: 'Payment', render: (item) => {
      if (item.paymentStatus === 'paid') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" title={item.transactionId || ''}>
            Paid
          </span>
        );
      }
      return <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
    }},
    { key: 'registrationStatus', header: 'Status', sortable: true, filterable: true, filterOptions: ['confirmed', 'waitlist'], render: (item) => {
      const status = item.registrationStatus || 'confirmed';
      return status === 'waitlist'
        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Waitlist</span>
        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Confirmed</span>;
    }},
    { key: 'checkedInAt', header: 'Checked In?', sortable: true, render: (item) => item.checkedInAt ? <span className="text-xs text-green-600">Yes</span> : <span className="text-xs text-gray-400">No</span> },
    { key: 'registeredAt', header: 'Registered', sortable: true, render: (item) => formatDate(item.registeredAt) },
  ];

  return (
    <>
      <PageHeader
        title={stats.event.name || 'Event Dashboard'}
        description={`${formatDate(stats.event.date)} — ${stats.event.status === 'Upcoming' && stats.event.date === new Date().toISOString().split('T')[0] ? 'Today' : stats.event.status}`}
        action={
          <Link href="/event-management" className="btn-secondary flex items-center gap-2" title="Back to Events">
            <HiOutlineArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        }
      />

      {/* Quick Access Buttons */}
      {origin && (
        <div className="flex flex-wrap gap-3 mb-6">
          <a
            href={`/events/${eventId}/home`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Open Event Home Page"
          >
            <HiOutlineHome className="w-4 h-4" />
            Event Home
            <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5 opacity-50" />
          </a>
          <a
            href={`/events/${eventId}/register`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Open Registration Page"
          >
            <HiOutlineClipboardDocumentList className="w-4 h-4" />
            Registration
            <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5 opacity-50" />
          </a>
          <a
            href={`/events/${eventId}/checkin`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Open Check-in Page"
          >
            <HiOutlineCheckCircle className="w-4 h-4" />
            Check-in
            <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5 opacity-50" />
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column -- 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Attendance */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              title="Pre-Registered"
              value={String(stats.totalRegistrations)}
              icon={<HiOutlineTicket className="w-5 h-5" />}
              tooltip="Total registrations before event day"
            />
            <StatCard
              title="Checked In"
              value={String(stats.totalCheckins)}
              icon={<HiOutlineCheckCircle className="w-5 h-5" />}
              tooltip="Total attendees checked in at the event"
            />
            <StatCard
              title="Walk-ins"
              value={String(stats.walkIns)}
              icon={<HiOutlineUserGroup className="w-5 h-5" />}
              tooltip="Checked in without pre-registration"
            />
            {stats.waitlisted > 0 && (
              <StatCard
                title="Waitlisted"
                value={String(stats.waitlisted)}
                icon={<HiOutlineTicket className="w-5 h-5" />}
                tooltip="Registrations on the waitlist"
                trend="down"
              />
            )}
            <StatCard
              title="Reg. Headcount"
              value={String(registeredHeadcount)}
              icon={<HiOutlineIdentification className="w-5 h-5" />}
              tooltip="Total adults + kids from registrations"
            />
            <StatCard
              title="Actual Headcount"
              value={String(actualHeadcount)}
              icon={<HiOutlineArrowTrendingUp className="w-5 h-5" />}
              tooltip="Total adults + kids actually checked in"
            />
          </div>

          {/* Financials */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Revenue"
              value={formatCurrency(totalRevenue)}
              icon={<HiOutlineBanknotes className="w-5 h-5" />}
              tooltip="Total revenue collected from paid participants"
              trend={totalRevenue > 0 ? 'up' : undefined}
            />
            <StatCard
              title="Expenses"
              value={formatCurrency(stats.totalExpenses)}
              icon={<HiOutlineBanknotes className="w-5 h-5" />}
              tooltip="Total expenses for this event"
              trend={stats.totalExpenses > 0 ? 'down' : undefined}
            />
            <StatCard
              title="Unpaid"
              value={formatCurrency(totalUnpaid)}
              icon={<HiOutlineBanknotes className="w-5 h-5" />}
              tooltip="Outstanding amount from unpaid participants"
              trend={totalUnpaid > 0 ? 'down' : undefined}
            />
            <StatCard
              title="Paid"
              value={`${paidCount} of ${stats.participants.length}`}
              icon={<HiOutlineBanknotes className="w-5 h-5" />}
              tooltip="Number of participants who have paid"
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Check-ins</h2>
            <DataTable columns={checkinColumns} data={checkins} emptyMessage="No check-ins yet" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Registrations</h2>
            <DataTable columns={registrationColumns} data={registrations} emptyMessage="No registrations yet" />
          </div>
        </div>

        {/* Right column -- 1/3 */}
        <div className="space-y-6">
          {origin && (
            <>
              <QRCodeCard
                url={checkinUrl}
                title="Check-in QR Code"
                subtitle="Scan to check in at the event"
              />
              <QRCodeCard
                url={registerUrl}
                title="Registration QR Code"
                subtitle="Scan to register for the event"
              />
            </>
          )}

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Event Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{stats.event.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Date</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{formatDate(stats.event.date)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                <dd><StatusBadge status={stats.event.status === 'Upcoming' && stats.event.date === new Date().toISOString().split('T')[0] ? 'Today' : stats.event.status} /></dd>
              </div>
            </dl>
          </div>

          {/* Activity Stats */}
          {activities.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Activity Enrollment</h3>
              <dl className="space-y-2 text-sm">
                {activities.map((act) => (
                  <div key={act.id} className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{act.name}</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">{activityCounts[act.id] || 0}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
