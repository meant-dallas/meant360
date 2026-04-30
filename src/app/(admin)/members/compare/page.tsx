'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatPhone } from '@/lib/utils';
import toast from 'react-hot-toast';

interface MemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  membershipType: string;
  membershipLevel: string;
  membershipYears: string;
  status: string;
}

type CompareStatus = 'Retained' | 'New' | 'Lapsed';

interface CompareRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  membershipType: string;
  membershipLevel: string;
  status: string;
  compareStatus: CompareStatus;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: number[] = [];
for (let y = 2020; y <= currentYear; y++) {
  YEAR_OPTIONS.push(y);
}

const STATUS_STYLES: Record<CompareStatus, string> = {
  Retained: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  New: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Lapsed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function MembersComparePage() {
  const [allMembers, setAllMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearA, setYearA] = useState(String(currentYear - 1));
  const [yearB, setYearB] = useState(String(currentYear));
  const [compareFilter, setCompareFilter] = useState<CompareStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/members');
        const json = await res.json();
        if (json.success) setAllMembers(json.data);
      } catch {
        toast.error('Failed to fetch members');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasYear = (member: MemberRecord, year: string) =>
    member.membershipYears?.split(',').map((y) => y.trim()).includes(year);

  const rows: CompareRow[] = [];
  const seen = new Set<string>();

  for (const m of allMembers) {
    if (seen.has(m.id)) continue;
    const inA = hasYear(m, yearA);
    const inB = hasYear(m, yearB);
    if (!inA && !inB) continue;
    seen.add(m.id);
    const compareStatus: CompareStatus =
      inA && inB ? 'Retained' : inB ? 'New' : 'Lapsed';
    rows.push({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim() || m.name,
      email: m.email,
      phone: m.phone,
      membershipType: m.membershipType,
      membershipLevel: m.membershipLevel,
      status: m.status,
      compareStatus,
    });
  }

  const filtered = rows.filter((r) => {
    if (compareFilter && r.compareStatus !== compareFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const retained = rows.filter((r) => r.compareStatus === 'Retained').length;
  const newMembers = rows.filter((r) => r.compareStatus === 'New').length;
  const lapsed = rows.filter((r) => r.compareStatus === 'Lapsed').length;
  const retentionRate = retained + lapsed > 0
    ? Math.round((retained / (retained + lapsed)) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Member Year Comparison"
        description="Compare membership between two years"
      />

      {/* Year selectors */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Year A</label>
          <select
            value={yearA}
            onChange={(e) => setYearA(e.target.value)}
            className="select w-28"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Year B</label>
          <select
            value={yearB}
            onChange={(e) => setYearB(e.target.value)}
            className="select w-28"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && yearA !== yearB && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Retained</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{retained}</p>
            <p className="text-xs text-gray-400 mt-1">in both {yearA} &amp; {yearB}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">New in {yearB}</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{newMembers}</p>
            <p className="text-xs text-gray-400 mt-1">not in {yearA}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Lapsed from {yearA}</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{lapsed}</p>
            <p className="text-xs text-gray-400 mt-1">not in {yearB}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Retention Rate</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{retentionRate}%</p>
            <p className="text-xs text-gray-400 mt-1">from {yearA} → {yearB}</p>
          </div>
        </div>
      )}

      {yearA === yearB && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">Select two different years to compare.</p>
      )}

      {/* Filter bar */}
      {!loading && yearA !== yearB && (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
          <input
            type="text"
            placeholder="Search name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full sm:w-64"
          />
          <div className="flex gap-2">
            {(['', 'Retained', 'New', 'Lapsed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCompareFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  compareFilter === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-400'
                }`}
              >
                {s === '' ? 'All' : s}
                {s !== '' && (
                  <span className="ml-1 opacity-70">
                    ({s === 'Retained' ? retained : s === 'New' ? newMembers : lapsed})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : yearA !== yearB ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Level</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{yearA} → {yearB}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No members found</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatPhone(row.phone)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.membershipType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.membershipLevel}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[row.compareStatus]}`}>
                        {row.compareStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
            {filtered.length} member{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      ) : null}
    </>
  );
}
