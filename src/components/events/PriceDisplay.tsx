'use client';

import type { PriceBreakdown } from '@/types';

interface PriceDisplayProps {
  breakdown: PriceBreakdown;
}

export default function PriceDisplay({ breakdown }: PriceDisplayProps) {
  // Guard on whether there's anything to list, not on the final total — an
  // edit of an already-paid registration with nothing newly due legitimately
  // totals $0 (nothing left to charge) while still having real line items
  // and an "Already paid" discount worth showing.
  if (breakdown.lineItems.length === 0 && breakdown.discounts.length === 0) return null;

  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  // A negative total means the registrant is owed money back (e.g. editing
  // an already-paid registration down in cost) rather than owing more —
  // label and color it as a refund instead of a literal negative dollar
  // total, which would read as still-owed.
  const isRefund = breakdown.total < -0.001;

  return (
    <div className="bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl p-4 space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Order Summary</h3>

      <div className="space-y-1.5">
        {breakdown.lineItems.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-gray-400">{item.label}</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-gray-100">{fmt(item.amount)}</span>
            </div>
            {item.participants && item.participants.length > 0 && (
              <ul className="mt-0.5 pl-3 border-l-2 border-slate-200 dark:border-gray-600 space-y-0.5">
                {item.participants.map((p, j) => (
                  <li key={j} className="text-xs text-slate-400 dark:text-gray-500">{p}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {breakdown.discounts.length > 0 && (
        <>
          <div className="border-t border-dashed border-slate-200 dark:border-gray-600 pt-1">
            <div className="flex justify-between text-sm text-slate-500 dark:text-gray-400">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{fmt(breakdown.subtotal)}</span>
            </div>
          </div>
          <div className="space-y-1">
            {breakdown.discounts.map((d, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-green-600 dark:text-green-400">{d.label}</span>
                <span className="font-mono tabular-nums text-green-600 dark:text-green-400">-{fmt(-d.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-dashed border-slate-200 dark:border-gray-600 pt-2 flex justify-between items-baseline">
        <span className={`font-semibold ${isRefund ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-gray-100'}`}>{isRefund ? 'Refund due' : 'Total'}</span>
        <span className={`font-mono tabular-nums font-semibold text-lg ${isRefund ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-gray-100'}`}>{fmt(breakdown.total)}</span>
      </div>
    </div>
  );
}
