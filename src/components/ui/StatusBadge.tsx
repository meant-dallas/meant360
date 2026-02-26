'use client';

import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  Paid: 'bg-green-100 text-green-800',
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-blue-100 text-blue-800',
  Reimbursed: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Completed: 'bg-green-100 text-green-800',
  Upcoming: 'bg-blue-100 text-blue-800',
  Today: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-gray-100 text-gray-800',
  Untagged: 'bg-gray-100 text-gray-600',
  Inactive: 'bg-gray-100 text-gray-600',
  Active: 'bg-green-100 text-green-800',
  'Not Renewed': 'bg-yellow-100 text-yellow-800',
  Expired: 'bg-red-100 text-red-800',
  Member: 'bg-indigo-100 text-indigo-800',
  Guest: 'bg-purple-100 text-purple-800',
  'Checked In': 'bg-green-100 text-green-800',
  Registered: 'bg-blue-100 text-blue-800',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = variants[status] || 'bg-gray-100 text-gray-800';
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variant, className)}>
      {status}
    </span>
  );
}
