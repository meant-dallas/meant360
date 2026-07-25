'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi2';

interface HistoryRow {
  date: string;
  lines: string[];
  type: string;
}

interface EventHistoryGroup {
  eventId: string;
  eventName: string;
  eventDate: string;
  rows: HistoryRow[];
}

export default function PaymentHistoryPage() {
  const [groups, setGroups] = useState<EventHistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/portal/payment-history');
        const json = await res.json();
        if (json.success) setGroups(json.data.events || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Payment History</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Every charge, edit, and refund on your event registrations.
      </p>

      {groups.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No payment history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isExpanded = expanded === group.eventId;
            return (
              <div key={group.eventId} className="card">
                <button
                  onClick={() => setExpanded(isExpanded ? null : group.eventId)}
                  className="w-full p-4 text-left flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{group.eventName}</h3>
                    {group.eventDate && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(group.eventDate)}</p>
                    )}
                  </div>
                  {isExpanded ? (
                    <HiOutlineChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <HiOutlineChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                    {group.rows.map((row, i) => (
                      <div key={i} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">{row.date}</div>
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {row.lines.map((line, j) => <div key={j}>{line}</div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
