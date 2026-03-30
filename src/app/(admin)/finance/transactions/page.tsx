'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { useYear } from '@/contexts/YearContext';
import toast from 'react-hot-toast';

interface ActivityRecord {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  description: string;
}

const ACTION_OPTIONS = ['create', 'update', 'delete'];
const ENTITY_OPTIONS = ['Member', 'Guest', 'Sponsor', 'Event', 'Income', 'Expense', 'Reimbursement', 'Registration', 'Check-in', 'Payment', 'Settings', 'Transaction Sync'];

const actionBadge = (action: string) => {
  switch (action) {
    case 'create':
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    case 'update':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
    case 'delete':
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
};

function timeAgo(timestamp: string): string {
  if (!timestamp) return '';
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ActivityLogPage() {
  const { year } = useYear();
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [search, setSearch] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', String(year));
      if (filterAction) params.set('action', filterAction);
      if (filterEntity) params.set('entityType', filterEntity);
      if (search) params.set('search', search);
      const res = await fetch(`/api/activity-log?${params}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
    } catch {
      toast.error('Failed to fetch activity log');
    } finally {
      setLoading(false);
    }
  }, [year, filterAction, filterEntity, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const columns: Column<ActivityRecord>[] = [
    {
      key: 'timestamp',
      header: 'When',
      sortable: true,
      render: (item) => (
        <span className="text-sm text-gray-600 dark:text-gray-400" title={item.timestamp}>
          {timeAgo(item.timestamp)}
        </span>
      ),
    },
    {
      key: 'userEmail',
      header: 'User',
      sortable: true,
      filterable: true,
      render: (item) => (
        <span className="text-sm truncate max-w-[180px] block" title={item.userEmail}>
          {item.userEmail}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      filterable: true,
      filterOptions: ACTION_OPTIONS,
      render: (item) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${actionBadge(item.action)}`}>
          {item.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Entity Type',
      sortable: true,
      filterable: true,
      filterOptions: ENTITY_OPTIONS,
    },
    {
      key: 'entityLabel',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (item) => (
        <span className="font-medium text-sm truncate max-w-[200px] block" title={item.entityLabel}>
          {item.entityLabel}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      render: (item) => (
        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[300px] block" title={item.description}>
          {item.description}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Activity Log"
        description={`${records.length} actions recorded`}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="select w-full sm:w-40">
          <option value="">All Actions</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a} className="capitalize">{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Entity Types</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search names, descriptions..."
          className="input w-full sm:w-64"
        />
      </div>

      <DataTable columns={columns} data={records} loading={loading} emptyMessage="No activity recorded yet" />
    </>
  );
}
