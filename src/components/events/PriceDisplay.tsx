'use client';

import type { PriceBreakdown } from '@/types';

interface PriceDisplayProps {
  breakdown: PriceBreakdown;
}

export default function PriceDisplay({ breakdown }: PriceDisplayProps) {
  if (breakdown.total === 0) return null;

  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div className="bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl p-4 space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Order Summary</h3>

      <div className="space-y-1">
        {breakdown.lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-500 dark:text-gray-400">{item.label}</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-gray-100">{fmt(item.amount)}</span>
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
        <span className="font-semibold text-slate-900 dark:text-gray-100">Total</span>
        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-gray-100 text-lg">{fmt(breakdown.total)}</span>
      </div>
    </div>
  );
}
