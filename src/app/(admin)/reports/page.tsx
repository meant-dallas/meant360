'use client';

import { useState, useCallback, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { analytics } from '@/lib/analytics';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentArrowDown,
  HiOutlineCalendarDays,
  HiOutlineCalendar,
  HiOutlineBuildingStorefront,
} from 'react-icons/hi2';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function ReportsPage() {
  const [events, setEvents] = useState<{ name: string }[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Event report state
  const [eventName, setEventName] = useState('');
  const [eventFormat, setEventFormat] = useState('pdf');

  // Monthly report state
  const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().getMonth() + 1);
  const [beginningBalance, setBeginningBalance] = useState('0');
  const [monthlyFormat, setMonthlyFormat] = useState('pdf');

  // Annual report state
  const [annualYear, setAnnualYear] = useState(new Date().getFullYear());
  const [annualFormat, setAnnualFormat] = useState('pdf');

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const downloadReport = async (type: string, params: Record<string, string>, filename: string) => {
    setDownloading(type);
    try {
      const url = new URL('/api/reports', window.location.origin);
      url.searchParams.set('type', type);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

      const res = await fetch(url.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Download failed' }));
        toast.error(json.error || 'Download failed');
        return;
      }

      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success('Report downloaded');
      analytics.reportExported(type, params.format || 'pdf');
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader title="Reports" description="Generate financial reports in PDF or CSV format" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Report */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <HiOutlineBuildingStorefront className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Event Report</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Income, sponsorship, expenses per event</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Event</label>
              <select value={eventName} onChange={(e) => setEventName(e.target.value)} className="select">
                <option value="">Select event</option>
                {events.map((evt) => <option key={evt.name} value={evt.name}>{evt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Format</label>
              <select value={eventFormat} onChange={(e) => setEventFormat(e.target.value)} className="select">
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button
              disabled={!eventName || downloading === 'event'}
              onClick={() =>
                downloadReport(
                  'event',
                  { event: eventName, format: eventFormat },
                  `event-report-${eventName}.${eventFormat}`,
                )
              }
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <HiOutlineDocumentArrowDown className="w-4 h-4" />
              {downloading === 'event' ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        </div>

        {/* Monthly Report */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <HiOutlineCalendarDays className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Monthly Treasurer Report</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Balance, income, expenses for a month</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">Year</label>
                <select value={monthlyYear} onChange={(e) => setMonthlyYear(parseInt(e.target.value))} className="select">
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Month</label>
                <select value={monthlyMonth} onChange={(e) => setMonthlyMonth(parseInt(e.target.value))} className="select">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Beginning Balance ($)</label>
              <input type="number" step="0.01" value={beginningBalance} onChange={(e) => setBeginningBalance(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Format</label>
              <select value={monthlyFormat} onChange={(e) => setMonthlyFormat(e.target.value)} className="select">
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button
              disabled={downloading === 'monthly'}
              onClick={() =>
                downloadReport(
                  'monthly',
                  { year: String(monthlyYear), month: String(monthlyMonth), beginningBalance, format: monthlyFormat },
                  `monthly-report-${monthlyYear}-${String(monthlyMonth).padStart(2, '0')}.${monthlyFormat}`,
                )
              }
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <HiOutlineDocumentArrowDown className="w-4 h-4" />
              {downloading === 'monthly' ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        </div>

        {/* Annual Report */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <HiOutlineCalendar className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Annual Report</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Full year financial summary</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Financial Year</label>
              <select value={annualYear} onChange={(e) => setAnnualYear(parseInt(e.target.value))} className="select">
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Format</label>
              <select value={annualFormat} onChange={(e) => setAnnualFormat(e.target.value)} className="select">
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button
              disabled={downloading === 'annual'}
              onClick={() =>
                downloadReport(
                  'annual',
                  { year: String(annualYear), format: annualFormat },
                  `annual-report-${annualYear}.${annualFormat}`,
                )
              }
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <HiOutlineDocumentArrowDown className="w-4 h-4" />
              {downloading === 'annual' ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
