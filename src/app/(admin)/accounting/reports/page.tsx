'use client';

import { useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/utils';

type ReportType = 'monthly-income' | 'monthly-expenses' | 'annual-summary' | 'processing-fees' | 'receivables' | 'payables' | 'account-balances' | null;

interface MonthlyReport {
  months: Record<string, Record<string, number>>;
  categories: string[];
  monthTotals: Record<string, number>;
  categoryTotals: Record<string, number>;
  grandTotal: number;
}

interface AnnualReport {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  totalFees: number;
  netIncome: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

interface FeesReport {
  total: number;
  byProvider: Record<string, number>;
}

interface ArApReport {
  total: number;
  overdue: number;
  items: Array<{ id: string; partyName?: string; vendorName?: string; amount: string; receivedAmount?: string; paidAmount?: string; dueDate: string | null; status: string }>;
}

interface BalanceItem {
  code: string;
  name: string;
  type: string;
  balance: number;
}

const REPORT_CARDS = [
  { type: 'monthly-income' as const, title: 'Income Summary', desc: 'All income by category and month' },
  { type: 'monthly-expenses' as const, title: 'Expense Summary', desc: 'All expenses by category and month' },
  { type: 'annual-summary' as const, title: 'Annual Summary', desc: 'Full year income vs expenses' },
  { type: 'processing-fees' as const, title: 'Processing Fees', desc: 'Square & PayPal fees paid' },
  { type: 'receivables' as const, title: 'Money Owed to Us', desc: 'Outstanding receivables snapshot' },
  { type: 'payables' as const, title: 'Bills Outstanding', desc: 'Unpaid bills snapshot' },
  { type: 'account-balances' as const, title: 'Account Balances', desc: 'Chart of accounts with balances' },
];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchReport = useCallback(async (type: ReportType) => {
    if (!type) return;
    setActiveReport(type);
    setLoading(true);
    try {
      const params = new URLSearchParams({ reportType: type });
      if (type === 'annual-summary') params.set('year', String(year));
      else { params.set('startDate', startDate); params.set('endDate', endDate); }

      const res = await fetch(`/api/fin/reports?${params}`);
      const json = await res.json();
      if (json.success) setReportData(json.data);
    } catch (err) {
      console.error('Report failed:', err);
    } finally {
      setLoading(false);
    }
  }, [year, startDate, endDate]);

  const renderMonthlyTable = (data: MonthlyReport, label: string, colorClass: string) => {
    const sortedMonths = Object.keys(data.months).sort();
    const monthNames = sortedMonths.map((m) => {
      const [y, mo] = m.split('-');
      return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="p-3 text-left font-semibold">Category</th>
              {monthNames.map((m, i) => <th key={i} className="p-3 text-right font-semibold">{m}</th>)}
              <th className={`p-3 text-right font-semibold ${colorClass}`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((cat) => (
              <tr key={cat} className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3 font-medium">{cat}</td>
                {sortedMonths.map((m) => (
                  <td key={m} className="p-3 text-right">{formatCurrency(data.months[m]?.[cat] ?? 0)}</td>
                ))}
                <td className={`p-3 text-right font-semibold ${colorClass}`}>{formatCurrency(data.categoryTotals[cat] ?? 0)}</td>
              </tr>
            ))}
            <tr className="font-bold border-t-2 border-gray-300 dark:border-gray-600">
              <td className="p-3">Total {label}</td>
              {sortedMonths.map((m) => (
                <td key={m} className="p-3 text-right">{formatCurrency(data.monthTotals[m] ?? 0)}</td>
              ))}
              <td className={`p-3 text-right ${colorClass}`}>{formatCurrency(data.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Reports" description="Generate financial reports for any time period." />

      {/* Date Controls */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium">Period:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        <span className="text-gray-400 text-sm ml-4">Year:</span>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-sm py-1.5 w-auto max-w-[90px]" />
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {REPORT_CARDS.map((r) => (
          <button
            key={r.type}
            onClick={() => fetchReport(r.type)}
            className={`card p-4 text-left hover:border-primary-400 hover:shadow-md transition-all ${activeReport === r.type ? 'border-primary-500 ring-2 ring-primary-200' : ''}`}
          >
            <h4 className="font-semibold text-sm">{r.title}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* Report Content */}
      {loading && <div className="card p-8 text-center text-gray-400">Loading report...</div>}

      {!loading && activeReport === 'monthly-income' && reportData && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Income Summary</h3>
          {renderMonthlyTable(reportData as MonthlyReport, 'Income', 'text-green-600')}
        </div>
      )}

      {!loading && activeReport === 'monthly-expenses' && reportData && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Expense Summary</h3>
          {renderMonthlyTable(reportData as MonthlyReport, 'Expenses', 'text-red-600')}
        </div>
      )}

      {!loading && activeReport === 'annual-summary' && reportData && <AnnualSummaryReport data={reportData as AnnualReport} />}
      {!loading && activeReport === 'processing-fees' && reportData && <ProcessingFeesReport data={reportData as FeesReport} />}
      {!loading && activeReport === 'receivables' && reportData && <ReceivablesReport data={reportData as ArApReport} />}
      {!loading && activeReport === 'payables' && reportData && <PayablesReport data={reportData as ArApReport} />}
      {!loading && activeReport === 'account-balances' && reportData && <AccountBalancesReport data={reportData as BalanceItem[]} />}
    </div>
  );
}

function AnnualSummaryReport({ data: d }: { data: AnnualReport }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-4">Annual Summary — {d.year}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-sm mb-2 text-green-600">Income by Category</h4>
          {Object.entries(d.incomeByCategory).map(([cat, amount]) => (
            <div key={cat} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800">
              <span>{cat}</span><span>{formatCurrency(amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t-2 border-green-300">
            <span>Total Income</span><span className="text-green-600">{formatCurrency(d.totalIncome)}</span>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-2 text-red-600">Expenses by Category</h4>
          {Object.entries(d.expenseByCategory).map(([cat, amount]) => (
            <div key={cat} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800">
              <span>{cat}</span><span>{formatCurrency(amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t-2 border-red-300">
            <span>Total Expenses</span><span className="text-red-600">{formatCurrency(d.totalExpenses)}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center">
        <div>
          <div className="text-xs text-gray-500 uppercase">Net Income ({d.year})</div>
          <div className={`text-2xl font-bold ${d.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(d.netIncome)}</div>
        </div>
        <div className="text-right text-sm text-gray-600">
          <div>Income: {formatCurrency(d.totalIncome)}</div>
          <div>Expenses: -{formatCurrency(d.totalExpenses)}</div>
        </div>
      </div>
    </div>
  );
}

function ProcessingFeesReport({ data: d }: { data: FeesReport }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-4">Processing Fees</h3>
      <div className="text-2xl font-bold text-red-600 mb-4">{formatCurrency(d.total)}</div>
      {Object.entries(d.byProvider).map(([provider, amount]) => (
        <div key={provider} className="flex justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 capitalize">
          <span>{provider}</span><span>{formatCurrency(amount)}</span>
        </div>
      ))}
    </div>
  );
}

function ReceivablesReport({ data: d }: { data: ArApReport }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-2">Money Owed to Us</h3>
      <div className="flex gap-6 mb-4">
        <div><span className="text-sm text-gray-500">Total:</span> <span className="font-bold">{formatCurrency(d.total)}</span></div>
        <div><span className="text-sm text-gray-500">Overdue:</span> <span className="font-bold text-red-600">{formatCurrency(d.overdue)}</span></div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="p-2 text-left">Party</th>
          <th className="p-2 text-right">Amount</th>
          <th className="p-2 text-right">Received</th>
          <th className="p-2 text-left">Due Date</th>
          <th className="p-2 text-center">Status</th>
        </tr></thead>
        <tbody>
          {d.items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="p-2">{item.partyName}</td>
              <td className="p-2 text-right">{formatCurrency(Number(item.amount))}</td>
              <td className="p-2 text-right">{formatCurrency(Number(item.receivedAmount ?? 0))}</td>
              <td className="p-2">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '--'}</td>
              <td className="p-2 text-center capitalize">{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayablesReport({ data: d }: { data: ArApReport }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-2">Bills Outstanding</h3>
      <div className="flex gap-6 mb-4">
        <div><span className="text-sm text-gray-500">Total:</span> <span className="font-bold">{formatCurrency(d.total)}</span></div>
        <div><span className="text-sm text-gray-500">Overdue:</span> <span className="font-bold text-red-600">{formatCurrency(d.overdue)}</span></div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="p-2 text-left">Vendor</th>
          <th className="p-2 text-right">Amount</th>
          <th className="p-2 text-right">Paid</th>
          <th className="p-2 text-left">Due Date</th>
          <th className="p-2 text-center">Status</th>
        </tr></thead>
        <tbody>
          {d.items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="p-2">{item.vendorName}</td>
              <td className="p-2 text-right">{formatCurrency(Number(item.amount))}</td>
              <td className="p-2 text-right">{formatCurrency(Number(item.paidAmount ?? 0))}</td>
              <td className="p-2">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '--'}</td>
              <td className="p-2 text-center capitalize">{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountBalancesReport({ data }: { data: BalanceItem[] }) {
  const grouped: Record<string, BalanceItem[]> = {};
  for (const b of data) {
    if (!grouped[b.type]) grouped[b.type] = [];
    grouped[b.type].push(b);
  }
  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense'];
  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-4">Account Balances</h3>
      {typeOrder.filter((t) => grouped[t]).map((type) => (
        <div key={type} className="mb-4">
          <h4 className="font-semibold text-sm uppercase text-gray-500 mb-2">{type}</h4>
          {grouped[type].map((b) => (
            <div key={b.code} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span><span className="text-gray-400 mr-2">{b.code}</span>{b.name}</span>
              <span className={b.balance >= 0 ? '' : 'text-red-600'}>{formatCurrency(b.balance)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
