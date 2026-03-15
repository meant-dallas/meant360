'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/utils';
import {
  HiOutlineBanknotes,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

interface OverviewData {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  needsReview: number;
  unmatchedBankDeposits: number;
  arOutstanding: number;
  apOutstanding: number;
  transactionStats: {
    needsReview: number;
    categorized: number;
    recorded: number;
    verified: number;
    total: number;
  };
}

export default function AccountingOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fin/overview');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Accounting Overview" description="Here's what's happening with your finances." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const d = data ?? { totalIncome: 0, totalExpenses: 0, netBalance: 0, needsReview: 0, unmatchedBankDeposits: 0, arOutstanding: 0, apOutstanding: 0, transactionStats: { needsReview: 0, categorized: 0, recorded: 0, verified: 0, total: 0 } };

  return (
    <div>
      <PageHeader title="Accounting Overview" description="Here's what's happening with your finances." />

      {/* Key Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Income (YTD)"
          value={formatCurrency(d.totalIncome)}
          subtitle={`${d.transactionStats.total} transactions`}
          icon={<HiOutlineArrowTrendingUp className="w-5 h-5" />}
          trend="up"
        />
        <StatCard
          title="Total Expenses (YTD)"
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
          value={String(d.needsReview)}
          subtitle="Transactions to review"
          icon={<HiOutlineExclamationTriangle className="w-5 h-5" />}
          className={d.needsReview > 0 ? 'border-l-4 border-yellow-400' : ''}
        />
      </div>

      {/* Alerts */}
      <div className="space-y-3 mb-6">
        {d.needsReview > 0 && (
          <div className="card p-4 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-center gap-3">
              <HiOutlineExclamationTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <div>
                <strong>{d.needsReview} new transaction{d.needsReview !== 1 ? 's' : ''}</strong> need to be reviewed and categorized.
                <Link href="/accounting/transactions?status=NEW" className="text-primary-600 dark:text-primary-400 font-semibold ml-2 hover:underline">
                  Review now
                </Link>
              </div>
            </div>
          </div>
        )}
        {d.unmatchedBankDeposits > 0 && (
          <div className="card p-4 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center gap-3">
              <HiOutlineBanknotes className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <strong>{d.unmatchedBankDeposits} bank deposit{d.unmatchedBankDeposits !== 1 ? 's' : ''}</strong> haven&apos;t been matched to payments yet.
                <Link href="/accounting/bank-matching" className="text-primary-600 dark:text-primary-400 font-semibold ml-2 hover:underline">
                  Match now
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
                <Link href="/accounting/money-owed" className="text-primary-600 dark:text-primary-400 font-semibold ml-2 hover:underline">
                  View details
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/accounting/transactions" className="block p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="text-2xl mb-2">+</div>
            <div className="font-semibold text-sm">Add Transaction</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Record a payment or expense</div>
          </Link>
          <Link href="/accounting/transactions" className="block p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="text-2xl mb-2">&#8635;</div>
            <div className="font-semibold text-sm">Sync Payments</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Import from Square or PayPal</div>
          </Link>
          <Link href="/accounting/transactions" className="block p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="text-2xl mb-2">&#8613;</div>
            <div className="font-semibold text-sm">Upload Bank Statement</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Import CSV from your bank</div>
          </Link>
          <Link href="/accounting/reports" className="block p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="text-2xl mb-2">&#9776;</div>
            <div className="font-semibold text-sm">View Reports</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Income, expenses, summaries</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
