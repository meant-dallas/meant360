'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { useYear } from '@/contexts/YearContext';
import toast from 'react-hot-toast';
import { HiOutlineTrophy } from 'react-icons/hi2';

interface LeaderboardEntry {
  email: string;
  name: string;
  eventsAttended: number;
  points: number;
  year: number;
}

export default function EngagementPage() {
  const { year } = useYear();
  const [records, setRecords] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagement?year=${year}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch engagement data');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: Column<LeaderboardEntry>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (item) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-gray-100">{item.name || '—'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{item.email}</div>
        </div>
      ),
    },
    {
      key: 'eventsAttended',
      header: 'Events',
      sortable: true,
      render: (item) => (
        <span className="text-gray-900 dark:text-gray-100">{item.eventsAttended}</span>
      ),
    },
    {
      key: 'points',
      header: 'Points',
      sortable: true,
      render: (item) => (
        <span className="font-semibold text-primary-600 dark:text-primary-400">{item.points}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Engagement"
        description={`Member engagement leaderboard for ${year}`}
        action={
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <HiOutlineTrophy className="w-5 h-5 text-amber-500" />
            <span>{records.length} participants</span>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={records}
        loading={loading}
        emptyMessage="No engagement data yet"
      />
    </>
  );
}
