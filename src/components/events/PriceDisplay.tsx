'use client';

import type { PriceBreakdown } from '@/types';

interface PriceDisplayProps {
  breakdown: PriceBreakdown;
}

export default function PriceDisplay({ breakdown }: PriceDisplayProps) {
  if (breakdown.total === 0 && breakdown.lineItems.length === 0) return null;

  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Price Breakdown</h3>

      <div className="space-y-1">
        {breakdown.lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
            <span className="text-gray-900 dark:text-gray-100">{fmt(item.amount)}</span>
          </div>
        ))}
      </div>

      {breakdown.discounts.length > 0 && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-600 pt-1">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Subtotal</span>
              <span>{fmt(breakdown.subtotal)}</span>
            </div>
          </div>
          <div className="space-y-1">
            {breakdown.discounts.map((d, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-green-600 dark:text-green-400">{d.label}</span>
                <span className="text-green-600 dark:text-green-400">-{fmt(-d.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between">
        <span className="font-semibold text-gray-900 dark:text-gray-100">Total</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{fmt(breakdown.total)}</span>
      </div>
    </div>
  );
}
