'use client';

import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  Paid: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  Approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  Reimbursed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  Rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  Completed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  Upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  Today: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  Cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Untagged: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  Inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  Active: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  'Not Renewed': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  Expired: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  Member: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  Guest: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  'Checked In': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  Registered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  pending_zelle: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  'Pending - Zelle': 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  'On Hold': 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  // Financial statuses (simplified labels)
  'Needs Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  Categorized: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  Recorded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  Verified: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  Overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  Partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  Received: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
};

const displayLabels: Record<string, string> = {
  Active: 'Active Member',
  Expired: 'Expired Member',
  Member: 'Active Member',
  pending_zelle: 'Pending Zelle',
  'Pending - Zelle': 'Pending Zelle',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = variants[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variant, className)}>
      {displayLabels[status] || status}
    </span>
  );
}
