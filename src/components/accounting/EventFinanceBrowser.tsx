'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import EventFinancePane from '@/components/accounting/EventFinancePane';
import { formatDate } from '@/lib/utils';

interface EventRow { id: string; name: string; date: string; status: string }

type StatusFilter = 'all' | 'Completed' | 'Upcoming';

export default function EventFinanceBrowser() {
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get('eventId') || '';

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/events');
        const json = await res.json();
        if (json.success) {
          const rows: EventRow[] = json.data
            .map((e: EventRow) => ({ id: e.id, name: e.name, date: e.date, status: e.status }))
            .filter((e: EventRow) => e.status !== 'Cancelled')
            .sort((a: EventRow, b: EventRow) => b.date.localeCompare(a.date));
          setEvents(rows);
          // Most-recent-first, so default the selection to the first row.
          if (urlEventId && rows.some((r) => r.id === urlEventId)) setSelectedId(urlEventId);
          else if (rows.length > 0) setSelectedId(rows[0].id);
        }
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'Event finance browser fetch' } });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({
    all: events.length,
    Completed: events.filter((e) => e.status === 'Completed').length,
    Upcoming: events.filter((e) => e.status === 'Upcoming').length,
  }), [events]);

  const filtered = useMemo(() => {
    let rows = events;
    if (statusFilter !== 'all') rows = rows.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) => e.name.toLowerCase().includes(q));
    }
    return rows;
  }, [events, statusFilter, search]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  const chip = useCallback((key: StatusFilter, label: string) => (
    <button
      onClick={() => setStatusFilter(key)}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        statusFilter === key
          ? 'bg-primary-600 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {label} ({counts[key]})
    </button>
  ), [statusFilter, counts]);

  if (loading) {
    return <div className="card p-8 text-center text-gray-400">Loading events...</div>;
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide text-gray-600 dark:text-gray-400">
        Events
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Event list */}
        <div className="card p-4">
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-sm py-1.5 w-full mb-3"
          />
          <div className="flex flex-wrap gap-2 mb-3">
            {chip('all', 'All')}
            {chip('Completed', 'Completed')}
            {chip('Upcoming', 'Upcoming')}
          </div>
          <div className="space-y-1 max-h-[480px] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No events match.</p>
            )}
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedId === e.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="font-medium truncate">{e.name}</div>
                <div className="text-xs text-gray-400">{formatDate(e.date)} &middot; {e.status}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected event detail */}
        <div>
          {selected ? (
            <EventFinancePane key={selected.id} event={selected} />
          ) : (
            <div className="card p-8 text-center text-gray-400">Select an event to view its financials.</div>
          )}
        </div>
      </div>
    </div>
  );
}
