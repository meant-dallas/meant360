'use client';

import { formatCurrency } from '@/lib/utils';

interface FinanceCategoryBreakdownProps {
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

// Shared by the org-wide Accounting dashboard and the per-event finance pane
// so a category breakdown is computed/rendered exactly one way everywhere.
export default function FinanceCategoryBreakdown({ incomeByCategory, expenseByCategory }: FinanceCategoryBreakdownProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-green-600 mb-3 uppercase tracking-wide">Income by Category</h3>
        {Object.keys(incomeByCategory).length === 0 ? (
          <p className="text-sm text-gray-400">No income in this period</p>
        ) : (
          Object.entries(incomeByCategory)
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
        {Object.keys(expenseByCategory).length === 0 ? (
          <p className="text-sm text-gray-400">No expenses in this period</p>
        ) : (
          Object.entries(expenseByCategory)
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
  );
}
