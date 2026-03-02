'use client';

import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  tooltip?: string;
}

export default function StatCard({ title, value, subtitle, icon, trend, className, tooltip }: StatCardProps) {
  return (
    <div className={cn('card p-6', className)} title={tooltip}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p
            className={cn(
              'mt-2 text-xl md:text-2xl font-bold',
              trend === 'up' && 'text-green-600 dark:text-green-400',
              trend === 'down' && 'text-red-600 dark:text-red-400',
              !trend && 'text-gray-900 dark:text-gray-100',
            )}
          >
            {value}
          </p>
          {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {icon && (
          <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">{icon}</div>
        )}
      </div>
    </div>
  );
}
