'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import QRCodeCard from '@/components/ui/QRCodeCard';
import { formatDate, formatCurrency, formatTimeCSTShort, todayCST } from '@/lib/utils';
import { parseActivities, parseActivityRegistrations, parseFormConfig } from '@/lib/event-config';
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
  HiOutlineArrowTopRightOnSquare,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineDocumentArrowDown,
} from 'react-icons/hi2';
import { generateRegistrationReport } from '@/lib/pdf';

interface ParticipantRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  registeredAt: string;
  checkedInAt: string;
  registeredAdults: string;
  registeredKids: string;
  actualAdults: string;
  actualKids: string;
  selectedActivities: string;
  attendeeNames: string;
  emailConsent: string;
  mediaConsent: string;
  totalPrice: string;
  paymentStatus: string;
  paymentMethod: string;
  transactionId: string;
  registrationStatus: string;
  customFields: string;
}

interface EventStats {
  event: Record<string, string>;
  totalRegistrations: number;
  totalCheckins: number;
  memberCheckins: number;
  guestCheckins: number;
  walkIns: number;
  waitlisted: number;
  onHold: number;
  cancelled: number;
  participants: ParticipantRecord[];
  totalExpenses: number;
}

export default function EventDashboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string; type: 'registration' | 'checkin' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingItem, setEditingItem] = useState<{ participant: ParticipantRecord; type: 'registration' | 'checkin' } | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    adults: 0,
    kids: 0,
    actualAdults: 0,
    actualKids: 0,
    selectedActivities: '',
    attendeeNames: '',
    paymentStatus: '',
    paymentMethod: '',
    totalPrice: '',
    transactionId: '',
    registrationStatus: '',
    customFields: {} as Record<string, string>,
  });
  const [isSaving, setIsSaving] = useState(false);

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

  const confirmDelete = (item: ParticipantRecord, type: 'registration' | 'checkin') => {
    setDeletingItem({ id: item.id, name: item.name, type });
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const endpoint = deletingItem.type === 'registration' ? 'registrations' : 'checkins';
      const res = await fetch(`/api/events/${eventId}/${endpoint}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: deletingItem.id }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${deletingItem.type === 'registration' ? 'Registration' : 'Check-in'} deleted successfully`);
        setDeletingItem(null);
        fetchStats();
      } else {
        toast.error(json.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelRegistration = async (item: ParticipantRecord) => {
    if (!confirm(`Cancel registration for "${item.name}"? This will free up their spot.`)) return;
    try {
      const res = await fetch(`/api/events/${eventId}/registrations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: item.id, registrationStatus: 'cancelled' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Registration cancelled');
        fetchStats();
      } else {
        toast.error(json.error || 'Failed to cancel');
      }
    } catch {
      toast.error('Failed to cancel registration');
    }
  };

  const openEdit = (item: ParticipantRecord, type: 'registration' | 'checkin') => {
    setEditingItem({ participant: item, type });
    setEditForm({
      name: item.name,
      phone: item.phone || '',
      adults: parseInt(item.registeredAdults || '0', 10),
      kids: parseInt(item.registeredKids || '0', 10),
      actualAdults: parseInt(item.actualAdults || '0', 10),
      actualKids: parseInt(item.actualKids || '0', 10),
      selectedActivities: item.selectedActivities || '',
      attendeeNames: item.attendeeNames || '',
      paymentStatus: item.paymentStatus || '',
      paymentMethod: item.paymentMethod || '',
      totalPrice: item.totalPrice || '0',
      transactionId: item.transactionId || '',
      registrationStatus: item.registrationStatus || 'confirmed',
      customFields: (() => { try { return item.customFields ? JSON.parse(item.customFields) : {}; } catch { return {}; } })(),
    });
  };

  const handleEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const endpoint = editingItem.type === 'registration' ? 'registrations' : 'checkins';
      const payload: Record<string, unknown> = {
        participantId: editingItem.participant.id,
        name: editForm.name,
        phone: editForm.phone,
        selectedActivities: editForm.selectedActivities,
        attendeeNames: editForm.attendeeNames,
        paymentStatus: editForm.paymentStatus,
        paymentMethod: editForm.paymentMethod,
        totalPrice: editForm.totalPrice,
        transactionId: editForm.transactionId,
        customFields: Object.keys(editForm.customFields).length > 0 ? JSON.stringify(editForm.customFields) : '',
      };

      if (editingItem.type === 'registration') {
        payload.adults = editForm.adults;
        payload.kids = editForm.kids;
        payload.registrationStatus = editForm.registrationStatus;
      } else {
        // For check-ins, we update actual headcount
        payload.actualAdults = editForm.actualAdults;
        payload.actualKids = editForm.actualKids;
      }

      const res = await fetch(`/api/events/${eventId}/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${editingItem.type === 'registration' ? 'Registration' : 'Check-in'} updated successfully`);
        setEditingItem(null);
        fetchStats();
      } else {
        toast.error(json.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setIsSaving(false);
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

  const eventHomeUrl = `${origin}/events/${eventId}/home`;
  const checkinColumns: Column<ParticipantRecord>[] = [
    { key: 'name', header: 'Participant', sortable: true, filterable: true, render: (item) => (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
        {item.email && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.email}</span>
        )}
        {item.phone && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.phone}</span>
        )}
      </div>
    )},
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Member', 'Guest'], render: (item) => <StatusBadge status={item.type} /> },
    { key: 'headcount', header: 'Headcount', sortable: true, render: (item) => (
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 dark:text-gray-400">👥 {item.actualAdults || '0'}</span>
          <span className="text-gray-600 dark:text-gray-400">👶 {item.actualKids || '0'}</span>
        </div>
        {item.attendeeNames && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate" title={item.attendeeNames}>
            {item.attendeeNames}
          </div>
        )}
      </div>
    )},
    { key: 'totalPrice', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'), render: (item) => {
      const price = parseFloat(item.totalPrice || '0');
      return price > 0 ? (
        <span className="text-sm font-medium">{formatCurrency(price)}</span>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500">Free</span>
      );
    }},
    { key: 'paymentStatus', header: 'Payment', render: (item) => {
      if (item.paymentStatus === 'paid') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" title={item.transactionId || ''}>
            Paid{item.paymentMethod ? ` (${item.paymentMethod})` : ''}
          </span>
        );
      }
      return <span className="text-xs text-gray-400 dark:text-gray-500">Unpaid</span>;
    }},
    { key: 'registeredAt', header: 'Pre-Reg', sortable: true, render: (item) => item.registeredAt ? (
      <div className="flex items-center gap-1">
        <span className="text-xs text-green-600 dark:text-green-400">✓ Yes</span>
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <span className="text-xs text-blue-600 dark:text-blue-400">🚶 Walk-in</span>
      </div>
    )},
    { key: 'checkedInAt', header: 'Checked In', sortable: true, render: (item) => (
      <div className="text-sm">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {formatDate(item.checkedInAt)}
        </div>
        {item.checkedInAt && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatTimeCSTShort(item.checkedInAt)}
          </div>
        )}
      </div>
    )},
    { key: 'actions', header: 'Actions', render: (item) => (
      <div className="flex items-center gap-1">
        <button
          onClick={() => openEdit(item, 'checkin')}
          className="text-blue-500 hover:text-blue-700 p-1"
          title="Edit check-in"
        >
          <HiOutlinePencilSquare className="w-4 h-4" />
        </button>
        <button
          onClick={() => confirmDelete(item, 'checkin')}
          className="text-red-500 hover:text-red-700 p-1"
          title={item.registeredAt ? 'Remove check-in' : 'Delete walk-in'}
        >
          <HiOutlineTrash className="w-4 h-4" />
        </button>
      </div>
    )},
  ];

  const registrationColumns: Column<ParticipantRecord>[] = [
    { key: 'name', header: 'Participant', sortable: true, filterable: true, render: (item) => (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
        {item.email && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.email}</span>
        )}
        {item.phone && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.phone}</span>
        )}
      </div>
    )},
    { key: 'type', header: 'Type', sortable: true, filterable: true, filterOptions: ['Member', 'Guest'], render: (item) => <StatusBadge status={item.type} /> },
    { key: 'headcount', header: 'Registered', sortable: true, render: (item) => (
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 dark:text-gray-400">👥 {item.registeredAdults || '0'}</span>
          <span className="text-gray-600 dark:text-gray-400">👶 {item.registeredKids || '0'}</span>
        </div>
        {item.attendeeNames && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate" title={item.attendeeNames}>
            {item.attendeeNames}
          </div>
        )}
      </div>
    )},
    { key: 'totalPrice', header: 'Amount', sortable: true, sortFn: (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'), render: (item) => {
      const price = parseFloat(item.totalPrice || '0');
      return price > 0 ? (
        <span className="text-sm font-medium">{formatCurrency(price)}</span>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500">Free</span>
      );
    }},
    { key: 'paymentStatus', header: 'Payment', render: (item) => {
      if (item.paymentStatus === 'paid') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" title={item.transactionId || ''}>
            Paid{item.paymentMethod ? ` (${item.paymentMethod})` : ''}
          </span>
        );
      }
      return <span className="text-xs text-gray-400 dark:text-gray-500">Unpaid</span>;
    }},
    { key: 'registrationStatus', header: 'Status', sortable: true, filterable: true, filterOptions: ['confirmed', 'waitlist', 'on_hold', 'flagged', 'cancelled'], render: (item) => {
      const status = item.registrationStatus || 'confirmed';
      if (status === 'cancelled') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 line-through">Cancelled</span>;
      }
      if (status === 'waitlist') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Waitlist</span>;
      }
      if (status === 'on_hold') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">On Hold</span>;
      }
      if (status === 'flagged') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Flagged</span>;
      }
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Confirmed</span>;
    }},
    { key: 'checkedInAt', header: 'Checked In?', sortable: true, render: (item) => item.checkedInAt ? (
      <div className="flex items-center gap-1">
        <span className="text-xs text-green-600 dark:text-green-400">✓ Yes</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatTimeCSTShort(item.checkedInAt)}
        </span>
      </div>
    ) : (
      <span className="text-xs text-gray-400 dark:text-gray-500">No</span>
    )},
    { key: 'registeredAt', header: 'Registered', sortable: true, render: (item) => (
      <div className="text-sm">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {formatDate(item.registeredAt)}
        </div>
        {item.registeredAt && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatTimeCSTShort(item.registeredAt)}
          </div>
        )}
      </div>
    )},
    { key: 'actions', header: 'Actions', render: (item) => (
      <div className="flex items-center gap-1">
        <button
          onClick={() => openEdit(item, 'registration')}
          className="text-blue-500 hover:text-blue-700 p-1"
          title="Edit registration"
        >
          <HiOutlinePencilSquare className="w-4 h-4" />
        </button>
        {item.registrationStatus !== 'cancelled' && (
          <button
            onClick={() => handleCancelRegistration(item)}
            className="text-red-500 hover:text-red-700 p-1"
            title="Cancel registration"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}
      </div>
    )},
  ];

  return (
    <>
      <PageHeader
        title={stats.event.name || 'Event Dashboard'}
        description={`${formatDate(stats.event.date)} — ${stats.event.status === 'Upcoming' && stats.event.date === todayCST() ? 'Today' : stats.event.status}`}
        action={
          <Link href="/event-management" className="btn-secondary flex items-center gap-2" title="Back to Events">
            <HiOutlineArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        }
      />

      {/* Quick Access Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        {origin && (
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
        )}
        <button
          onClick={() => {
            const registrations = stats.participants.filter(p => p.registeredAt);
            const formFields = parseFormConfig(stats.event.formConfig || '');
            const buf = generateRegistrationReport({
              eventName: stats.event.name || '',
              eventDate: stats.event.date || '',
              formFields: formFields.map(f => ({ id: f.id, label: f.label })),
              participants: registrations.map(p => ({
                name: p.name, email: p.email, phone: p.phone,
                type: p.type, registeredAdults: p.registeredAdults,
                registeredKids: p.registeredKids, attendeeNames: p.attendeeNames,
                selectedActivities: typeof p.selectedActivities === 'string' ? p.selectedActivities : JSON.stringify(p.selectedActivities || ''),
                registrationStatus: p.registrationStatus,
                emailConsent: p.emailConsent || '', mediaConsent: p.mediaConsent || '',
                registeredAt: p.registeredAt,
                customFields: p.customFields || '',
              })),
            });
            const blob = new Blob([buf], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(stats.event.name || 'event').replace(/[^a-zA-Z0-9]/g, '_')}_registrations.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="btn-secondary flex items-center gap-2 text-sm"
          title="Download registration report as PDF"
        >
          <HiOutlineDocumentArrowDown className="w-4 h-4" />
          Registration PDF
        </button>
        <button
          onClick={() => {
            const rows = stats.participants.filter(p => p.registeredAt || p.checkedInAt);
            const formFields = parseFormConfig(stats.event.formConfig || '');
            const baseHeaders = ['Name', 'Email', 'Phone', 'Type', 'Reg. Adults', 'Reg. Kids', 'Actual Adults', 'Actual Kids', 'Attendee Names', 'Activities', 'Status', 'Payment Status', 'Payment Method', 'Amount', 'Registered At', 'Checked In At'];
            const customHeaders = formFields.map(f => f.label);
            const headers = [...baseHeaders, ...customHeaders];
            const csvContent = [
              headers.join(','),
              ...rows.map(p => {
                let cfData: Record<string, string> = {};
                try { cfData = p.customFields ? JSON.parse(p.customFields) : {}; } catch { cfData = {}; }
                const baseRow = [
                  `"${(p.name || '').replace(/"/g, '""')}"`,
                  `"${(p.email || '').replace(/"/g, '""')}"`,
                  `"${(p.phone || '').replace(/"/g, '""')}"`,
                  p.type || '',
                  p.registeredAdults || '0',
                  p.registeredKids || '0',
                  p.actualAdults || '0',
                  p.actualKids || '0',
                  `"${(p.attendeeNames || '').replace(/"/g, '""')}"`,
                  `"${(typeof p.selectedActivities === 'string' ? p.selectedActivities : JSON.stringify(p.selectedActivities || '')).replace(/"/g, '""')}"`,
                  p.registrationStatus || '',
                  p.paymentStatus || '',
                  p.paymentMethod || '',
                  p.totalPrice || '0',
                  p.registeredAt || '',
                  p.checkedInAt || '',
                ];
                const customValues = formFields.map(f => `"${(cfData[f.id] || '').replace(/"/g, '""')}"`);
                return [...baseRow, ...customValues].join(',');
              }),
            ].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(stats.event.name || 'event').replace(/[^a-zA-Z0-9]/g, '_')}_registrations.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="btn-secondary flex items-center gap-2 text-sm"
          title="Download registration report as CSV"
        >
          <HiOutlineDocumentArrowDown className="w-4 h-4" />
          Registration CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column -- 3/4 */}
        <div className="lg:col-span-3 space-y-6">
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
            {stats.onHold > 0 && (
              <StatCard
                title="On Hold"
                value={String(stats.onHold)}
                icon={<HiOutlineBanknotes className="w-5 h-5" />}
                tooltip="Registrations on hold (pending Zelle verification)"
                trend="down"
              />
            )}
            {stats.cancelled > 0 && (
              <StatCard
                title="Cancelled"
                value={String(stats.cancelled)}
                icon={<HiOutlineTicket className="w-5 h-5" />}
                tooltip="Cancelled registrations"
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

        {/* Right column -- 1/4 */}
        <div className="space-y-6">
          {origin && (
            <QRCodeCard
              url={eventHomeUrl}
              title="Event QR Code"
              subtitle="Scan to visit the event page"
            />
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
                <dd><StatusBadge status={stats.event.status === 'Upcoming' && stats.event.date === todayCST() ? 'Today' : stats.event.status} /></dd>
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

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {deletingItem.type === 'registration' ? 'Delete Registration' : 'Remove Check-in'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {deletingItem.type === 'registration' 
                ? `Are you sure you want to delete the registration for "${deletingItem.name}"? This action cannot be undone.`
                : `Are you sure you want to remove the check-in for "${deletingItem.name}"?`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingItem(null)}
                className="btn-secondary"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-primary bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : deletingItem.type === 'registration' ? 'Delete' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Edit {editingItem.type === 'registration' ? 'Registration' : 'Check-in'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {editingItem.type === 'registration' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Adults
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.adults}
                      onChange={(e) => setEditForm(prev => ({ ...prev, adults: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Kids
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.kids}
                      onChange={(e) => setEditForm(prev => ({ ...prev, kids: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Actual Adults
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.actualAdults}
                      onChange={(e) => setEditForm(prev => ({ ...prev, actualAdults: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Actual Kids
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.actualKids}
                      onChange={(e) => setEditForm(prev => ({ ...prev, actualKids: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Attendee Names/Ages
                </label>
                <textarea
                  value={editForm.attendeeNames}
                  onChange={(e) => setEditForm(prev => ({ ...prev, attendeeNames: e.target.value }))}
                  rows={3}
                  placeholder="e.g., John (age 35), Jane (age 8)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Custom Fields */}
              {(() => {
                const formFields = parseFormConfig(stats.event.formConfig || '');
                if (formFields.length === 0) return null;
                return (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                    <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-3">Custom Fields</h4>
                    <div className="space-y-3">
                      {formFields.map((field) => (
                        <div key={field.id}>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {field.label}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={editForm.customFields[field.id] || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="">{field.placeholder || 'Select...'}</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              value={editForm.customFields[field.id] || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}
                              rows={2}
                              placeholder={field.placeholder || ''}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          ) : field.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.customFields[field.id] === 'true'}
                                onChange={(e) => setEditForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.checked ? 'true' : '' } }))}
                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-600 dark:text-gray-400">{field.placeholder || ''}</span>
                            </label>
                          ) : (
                            <input
                              type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
                              value={editForm.customFields[field.id] || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, customFields: { ...prev.customFields, [field.id]: e.target.value } }))}
                              placeholder={field.placeholder || ''}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Payment Information */}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-3">Payment Information</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={editForm.paymentStatus}
                      onChange={(e) => setEditForm(prev => ({ ...prev, paymentStatus: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  
                  {editForm.paymentStatus === 'paid' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={editForm.paymentMethod}
                        onChange={(e) => setEditForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Select method...</option>
                        <option value="cash">Cash</option>
                        <option value="square">Square</option>
                        <option value="paypal">PayPal</option>
                        <option value="zelle">Zelle</option>
                        <option value="terminal">Terminal</option>
                      </select>
                    </div>
                  )}
                </div>

                {editForm.paymentStatus === 'paid' && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Amount ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.totalPrice}
                        onChange={(e) => setEditForm(prev => ({ ...prev, totalPrice: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Transaction ID
                      </label>
                      <input
                        type="text"
                        value={editForm.transactionId}
                        onChange={(e) => setEditForm(prev => ({ ...prev, transactionId: e.target.value }))}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Registration Status (for registrations only) */}
              {editingItem.type === 'registration' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Registration Status
                  </label>
                  <select
                    value={editForm.registrationStatus}
                    onChange={(e) => setEditForm(prev => ({ ...prev, registrationStatus: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="waitlist">Waitlist</option>
                    <option value="flagged">Flagged for Review</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {editForm.registrationStatus === 'on_hold' && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      On hold status is typically used for Zelle payments pending verification
                    </p>
                  )}
                  {editForm.registrationStatus === 'flagged' && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Flagged for future review — this transaction needs attention
                    </p>
                  )}
                  {editForm.registrationStatus === 'waitlist' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Waitlist status means the event was at capacity when they registered
                    </p>
                  )}
                  {editForm.registrationStatus === 'cancelled' && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Cancelled registrations don&apos;t count toward capacity and the member can re-register
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="btn-secondary"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                className="btn-primary"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
