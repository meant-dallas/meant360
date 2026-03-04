'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import MonthlyChart from '@/components/charts/MonthlyChart';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { formatCurrency } from '@/lib/utils';
import { useYear } from '@/contexts/YearContext';
import type { DashboardSummary, EventSummary } from '@/types';
import {
  HiOutlineCurrencyDollar,
  HiOutlineHeart,
  HiOutlineDocumentText,
  HiOutlineReceiptRefund,
  HiOutlineArrowTrendingUp,
  HiOutlineUserGroup,
} from 'react-icons/hi2';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { year } = useYear();
  const [memberStats, setMemberStats] = useState<{ total: number; active: number } | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?year=${year}`);
      const json = await res.json();
      if (json.success) setSummary(json.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/members');
      const json = await res.json();
      if (json.success) {
        const members = json.data as { status: string }[];
        setMemberStats({
          total: members.length,
          active: members.filter((m) => m.status === 'Active').length,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchMembers();
  }, [fetchDashboard, fetchMembers]);

  const eventColumns: Column<EventSummary>[] = [
    { key: 'eventName', header: 'Event', sortable: true, filterable: true },
    {
      key: 'income',
      header: 'Income',
      sortable: true,
      sortFn: (a, b) => a.income - b.income,
      render: (item) => formatCurrency(item.income),
    },
    {
      key: 'sponsorship',
      header: 'Sponsorship',
      sortable: true,
      sortFn: (a, b) => a.sponsorship - b.sponsorship,
      render: (item) => formatCurrency(item.sponsorship),
    },
    {
      key: 'expenses',
      header: 'Expenses',
      sortable: true,
      sortFn: (a, b) => a.expenses - b.expenses,
      render: (item) => formatCurrency(item.expenses),
    },
    {
      key: 'reimbursements',
      header: 'Reimbursed',
      sortable: true,
      sortFn: (a, b) => a.reimbursements - b.reimbursements,
      render: (item) => item.reimbursements > 0 ? formatCurrency(item.reimbursements) : '—',
    },
    {
      key: 'net',
      header: 'Net',
      sortable: true,
      sortFn: (a, b) => a.net - b.net,
      render: (item) => (
        <span className={item.net >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {formatCurrency(item.net)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Financial Dashboard"
        description={`Financial Year ${year} (Jan 1 - Dec 31)`}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              title="Total Income"
              value={formatCurrency(summary.totalIncome)}
              icon={<HiOutlineCurrencyDollar className="w-6 h-6" />}
            />
            <StatCard
              title="Total Sponsorship"
              value={formatCurrency(summary.totalSponsorship)}
              icon={<HiOutlineHeart className="w-6 h-6" />}
            />
            <StatCard
              title="Total Expenses"
              value={formatCurrency(summary.totalExpenses)}
              icon={<HiOutlineDocumentText className="w-6 h-6" />}
            />
            <StatCard
              title="Net Surplus/Deficit"
              value={formatCurrency(summary.netSurplus)}
              trend={summary.netSurplus >= 0 ? 'up' : 'down'}
              icon={<HiOutlineArrowTrendingUp className="w-6 h-6" />}
            />
            <StatCard
              title="Reimbursements"
              value={formatCurrency(summary.totalReimbursed)}
              subtitle={summary.outstandingReimbursements > 0 ? `${formatCurrency(summary.outstandingReimbursements)} outstanding` : undefined}
              icon={<HiOutlineReceiptRefund className="w-6 h-6" />}
            />
            <StatCard
              title="Members"
              value={memberStats ? `${memberStats.active} / ${memberStats.total}` : '—'}
              subtitle={memberStats ? `${memberStats.active} active` : undefined}
              icon={<HiOutlineUserGroup className="w-6 h-6" />}
            />
          </div>

          {/* Monthly Chart */}
          <MonthlyChart data={summary.monthlySummary} />

          {/* Event Summary Table */}
          {summary.eventSummaries.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Event Summary</h3>
              <DataTable
                columns={eventColumns}
                data={summary.eventSummaries}
                emptyMessage="No events this year"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          Failed to load dashboard data. Check your Google Sheets connection.
        </div>
      )}
    </>
  );
}
