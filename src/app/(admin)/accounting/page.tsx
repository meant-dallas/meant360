'use client';

import { useEffect, useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/utils';
import {
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

interface OverviewData {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  uncategorized: number;
  arOutstanding: number;
  apOutstanding: number;
  transactionStats: {
    completed: number;
    pending: number;
    uncategorized: number;
    total: number;
  };
}

export default function AccountingDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/fin/overview?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
      Sentry.captureException(err, { extra: { context: 'Accounting overview fetch' } });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const d = data ?? {
    totalIncome: 0, totalExpenses: 0, netBalance: 0,
    incomeByCategory: {}, expenseByCategory: {},
    uncategorized: 0, arOutstanding: 0, apOutstanding: 0,
    transactionStats: { completed: 0, pending: 0, uncategorized: 0, total: 0 },
  };

  return (
    <div>
      <PageHeader title="Accounting Dashboard" description="Financial overview for your organization." />

      {/* Date Range */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium">Period:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        <button onClick={fetchData} className="btn btn-outline text-sm py-1.5">Refresh</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Key Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Total Income"
              value={formatCurrency(d.totalIncome)}
              subtitle={`${d.transactionStats.total} transactions`}
              icon={<HiOutlineArrowTrendingUp className="w-5 h-5" />}
              trend="up"
            />
            <StatCard
              title="Total Expenses"
              value={formatCurrency(d.totalExpenses)}
              icon={<HiOutlineArrowTrendingDown className="w-5 h-5" />}
              trend="down"
            />
            <StatCard
              title="Net Balance"
              value={formatCurrency(d.netBalance)}
              subtitle="Income minus expenses"
              icon={<HiOutlineBanknotes className="w-5 h-5" />}
              trend={d.netBalance >= 0 ? 'up' : 'down'}
            />
            <StatCard
              title="Needs Attention"
              value={String(d.uncategorized)}
              subtitle="Uncategorized transactions"
              icon={<HiOutlineExclamationTriangle className="w-5 h-5" />}
              className={d.uncategorized > 0 ? 'border-l-4 border-yellow-400' : ''}
            />
          </div>

          {/* Alerts */}
          <div className="space-y-3 mb-6">
            {d.uncategorized > 0 && (
              <div className="card p-4 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
                <div className="flex items-center gap-3">
                  <HiOutlineExclamationTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  <div>
                    <strong>{d.uncategorized} transaction{d.uncategorized !== 1 ? 's' : ''}</strong> need to be categorized.
                    <Link href="/accounting/transactions" className="text-primary-600 dark:text-primary-400 font-semibold ml-2 hover:underline">
                      Review now
                    </Link>
                  </div>
                </div>
              </div>
            )}
            {d.arOutstanding > 0 && (
              <div className="card p-4 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20">
                <div className="flex items-center gap-3">
                  <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <strong>{formatCurrency(d.arOutstanding)} outstanding</strong> in money owed to you.
                    <Link href="/accounting/pending" className="text-primary-600 dark:text-primary-400 font-semibold ml-2 hover:underline">
                      View details
                    </Link>
                  </div>
                </div>
              </div>
            )}
            {d.transactionStats.pending > 0 && (
              <div className="card p-4 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center gap-3">
                  <HiOutlineBanknotes className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <strong>{d.transactionStats.pending} pending transaction{d.transactionStats.pending !== 1 ? 's' : ''}</strong> not yet completed.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-green-600 mb-3 uppercase tracking-wide">Income by Category</h3>
              {Object.keys(d.incomeByCategory).length === 0 ? (
                <p className="text-sm text-gray-400">No income in this period</p>
              ) : (
                Object.entries(d.incomeByCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800">
                      <span>{cat}</span>
                      <span className="font-semibold text-green-600">{formatCurrency(amount)}</span>
                    </div>
                  ))
              )}
            </div>
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-red-600 mb-3 uppercase tracking-wide">Expenses by Category</h3>
              {Object.keys(d.expenseByCategory).length === 0 ? (
                <p className="text-sm text-gray-400">No expenses in this period</p>
              ) : (
                Object.entries(d.expenseByCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800">
                      <span>{cat}</span>
                      <span className="font-semibold text-red-600">{formatCurrency(amount)}</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Pending Money */}
          {(d.arOutstanding > 0 || d.apOutstanding > 0) && (
            <div className="card p-6 mb-6">
              <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-600 dark:text-gray-400">Pending Money</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase">Money to Receive</div>
                  <div className="text-xl font-bold text-amber-600">{formatCurrency(d.arOutstanding)}</div>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase">Bills to Pay</div>
                  <div className="text-xl font-bold text-purple-600">{formatCurrency(d.apOutstanding)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
