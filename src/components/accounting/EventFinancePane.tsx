'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import StatCard from '@/components/ui/StatCard';
import FinanceCategoryBreakdown from '@/components/accounting/FinanceCategoryBreakdown';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineBanknotes,
  HiOutlineHeart,
} from 'react-icons/hi2';

interface EventOption { id: string; name: string; date: string; status: string }

interface EventStats {
  event: { id: string; name: string; date: string; status: string; category?: string };
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  totalRegistrations: number;
  totalCheckins: number;
}

interface CategoryReport {
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

interface SponsorRow {
  id: string;
  name: string;
  amount: string;
  tier: string;
  status: string;
}

export default function EventFinancePane({ event }: { event: EventOption }) {
  const [stats, setStats] = useState<EventStats | null>(null);
  const [categories, setCategories] = useState<CategoryReport | null>(null);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reportRes, sponsorsRes] = await Promise.all([
        fetch(`/api/events/${event.id}/stats`),
        fetch(`/api/fin/reports?reportType=annual-summary&startDate=1970-01-01&endDate=2999-12-31&eventId=${event.id}`),
        fetch(`/api/sponsors?eventId=${event.id}`),
      ]);
      const [statsJson, reportJson, sponsorsJson] = await Promise.all([
        statsRes.json(), reportRes.json(), sponsorsRes.json(),
      ]);
      if (statsJson.success) setStats(statsJson.data);
      if (reportJson.success) setCategories(reportJson.data);
      if (sponsorsJson.success) setSponsors(sponsorsJson.data);
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Event finance pane fetch', eventId: event.id } });
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  const net = stats?.netBalance ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{event.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(event.date)} &middot; {event.status}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/accounting/transactions?eventId=${event.id}`} className="btn btn-outline text-xs py-1.5">
            View Transactions
          </Link>
          <Link href={`/accounting/reports?eventId=${event.id}`} className="btn btn-outline text-xs py-1.5">
            Full Report
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Income"
          value={formatCurrency(stats?.totalIncome ?? 0)}
          icon={<HiOutlineArrowTrendingUp className="w-5 h-5" />}
          tooltip="Net of refunds — can go negative for an event with heavy cancellations"
          trend={(stats?.totalIncome ?? 0) >= 0 ? 'up' : 'down'}
        />
        <StatCard
          title="Expenses"
          value={formatCurrency(stats?.totalExpenses ?? 0)}
          icon={<HiOutlineArrowTrendingDown className="w-5 h-5" />}
          trend={(stats?.totalExpenses ?? 0) > 0 ? 'down' : 'neutral'}
        />
        <StatCard
          title="Net"
          value={formatCurrency(net)}
          icon={<HiOutlineBanknotes className="w-5 h-5" />}
          trend={net >= 0 ? 'up' : 'down'}
        />
      </div>

      {categories && (
        <FinanceCategoryBreakdown
          incomeByCategory={categories.incomeByCategory}
          expenseByCategory={categories.expenseByCategory}
        />
      )}

      {sponsors.length > 0 && (
        <div className="card p-6">
          <h4 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <HiOutlineHeart className="w-4 h-4" /> Sponsors
          </h4>
          {sponsors.map((s) => (
            <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span>{s.name} {s.tier && <span className="text-gray-400">({s.tier})</span>}</span>
              <span className={s.status === 'Paid' ? 'font-semibold text-green-600' : 'text-gray-400'}>
                {formatCurrency(parseFloat(s.amount) || 0)} {s.status !== 'Paid' && `(${s.status})`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
