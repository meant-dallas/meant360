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
import { parsePricingRules, formatPricingSummary } from '@/lib/pricing';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineIdentification,
  HiOutlineTicket,
  HiOutlineArrowLeft,
  HiOutlineBanknotes,
} from 'react-icons/hi2';

interface CheckinRecord {
  id: string;
  name: string;
  email: string;
  type: string;
  checkedInAt: string;
  totalPrice: string;
  paymentStatus: string;
  transactionId: string;
}

interface RegistrationRecord {
  id: string;
  name: string;
  email: string;
  type: string;
  registeredAt: string;
  totalPrice: string;
  paymentStatus: string;
  transactionId: string;
}

interface EventStats {
  event: Record<string, string>;
  totalRegistrations: number;
  totalCheckins: number;
  memberCheckins: number;
  guestCheckins: number;
  registrations: RegistrationRecord[];
  checkins: CheckinRecord[];
}

export default function EventDashboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');

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

  const checkinColumns: Column<CheckinRecord>[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'type', header: 'Type', render: (item) => <StatusBadge status={item.type} /> },
    { key: 'totalPrice', header: 'Price', render: (item) => {
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
    { key: 'checkedInAt', header: 'Checked In', render: (item) => formatDate(item.checkedInAt) },
  ];

  const registrationColumns: Column<RegistrationRecord>[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'type', header: 'Type', render: (item) => <StatusBadge status={item.type} /> },
    { key: 'totalPrice', header: 'Price', render: (item) => {
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
    { key: 'registeredAt', header: 'Registered', render: (item) => formatDate(item.registeredAt) },
  ];

  if (loading || !stats) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const checkinUrl = `${origin}/events/${eventId}/checkin`;
  const registerUrl = `${origin}/events/${eventId}/register`;

  // Pricing summary
  const pricingRules = parsePricingRules(stats.event.pricingRules || '');
  const checkinRevenue = stats.checkins.reduce((sum, c) => sum + parseFloat(c.totalPrice || '0'), 0);
  const regRevenue = stats.registrations.reduce((sum, r) => sum + parseFloat(r.totalPrice || '0'), 0);
  const totalRevenue = Math.max(checkinRevenue, regRevenue);

  return (
    <>
      <PageHeader
        title={stats.event.name || 'Event Dashboard'}
        description={`${formatDate(stats.event.date)} — ${stats.event.status === 'Upcoming' && stats.event.date === new Date().toISOString().split('T')[0] ? 'Today' : stats.event.status}`}
        action={
          <Link href="/settings/events" className="btn-secondary flex items-center gap-2">
            <HiOutlineArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column -- 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Registrations"
              value={String(stats.totalRegistrations)}
              icon={<HiOutlineTicket className="w-5 h-5" />}
            />
            <StatCard
              title="Check-ins"
              value={String(stats.totalCheckins)}
              icon={<HiOutlineCheckCircle className="w-5 h-5" />}
            />
            <StatCard
              title="Members"
              value={String(stats.memberCheckins)}
              icon={<HiOutlineIdentification className="w-5 h-5" />}
            />
            <StatCard
              title="Guests"
              value={String(stats.guestCheckins)}
              icon={<HiOutlineUserGroup className="w-5 h-5" />}
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Check-ins</h2>
            <DataTable columns={checkinColumns} data={stats.checkins} emptyMessage="No check-ins yet" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Registrations</h2>
            <DataTable columns={registrationColumns} data={stats.registrations} emptyMessage="No registrations yet" />
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

          {/* Pricing Summary */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <HiOutlineBanknotes className="w-4 h-4" /> Pricing
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Rate</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{formatPricingSummary(pricingRules)}</dd>
              </div>
              {pricingRules.enabled && pricingRules.model !== 'free' && (
                <>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Member / Guest</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(pricingRules.memberPrice)} / {formatCurrency(pricingRules.guestPrice)}
                    </dd>
                  </div>
                  {pricingRules.kidPrice > 0 && (
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Kid Price</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(pricingRules.kidPrice)}</dd>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <dt className="text-gray-500 dark:text-gray-400">Revenue Estimate</dt>
                <dd className="font-bold text-lg text-gray-900 dark:text-gray-100">{formatCurrency(totalRevenue)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
