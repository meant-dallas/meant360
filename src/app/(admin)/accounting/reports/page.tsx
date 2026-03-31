'use client';

import { useState, useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency, todayCST } from '@/lib/utils';

type ReportType = 'financial-summary' | null;

interface AnnualReport {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  totalFees: number;
  netIncome: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  eventSummary: Array<{ eventName: string; income: number; expense: number; profitLoss: number }>;
  pendingReceivables: number;
  pendingPayables: number;
}

interface EventOption { id: string; name: string }

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(todayCST());
  const [eventFilter, setEventFilter] = useState('');
  const [events, setEvents] = useState<EventOption[]>([]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      const json = await res.json();
      if (json.success) setEvents(json.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
    } catch {}
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const fetchReport = useCallback(async () => {
    setActiveReport('financial-summary');
    setLoading(true);
    try {
      const params = new URLSearchParams({ reportType: 'annual-summary', startDate, endDate });
      if (eventFilter) params.set('eventId', eventFilter);
      const res = await fetch(`/api/fin/reports?${params}`);
      const json = await res.json();
      if (json.success) setReportData(json.data);
    } catch (err) {
      console.error('Report failed:', err);
      Sentry.captureException(err, { extra: { context: 'Financial report generation' } });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, eventFilter]);

  const handleDownloadPDF = useCallback(async () => {
    if (!activeReport || !reportData) return;

    const jsPDFModule = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const jsPDF = jsPDFModule.default;
    const autoTable = autoTableModule.default;

    const title = eventFilter ? `Report - ${events.find((e) => e.id === eventFilter)?.name || 'Event'}` : 'Financial Summary';
    const dateRange = `${startDate} to ${endDate}`;
    const doc = new jsPDF({ orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('MEANT', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text(title, pageWidth / 2, 30, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(dateRange, pageWidth / 2, 37, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(14, 41, pageWidth - 14, 41);

    let yPos = 50;
    const data = reportData as AnnualReport;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Income by Category (Gross)', 14, yPos);
      yPos += 3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const incomeRows: any[][] = [
        ...Object.entries(data.incomeByCategory).map(([cat, amount]) => [cat, formatCurrency(amount)]),
        [{ content: 'Total Gross Income', styles: { fontStyle: 'bold' } }, { content: formatCurrency(data.totalIncome), styles: { fontStyle: 'bold', textColor: [22, 163, 74] } }],
      ];
      if (data.totalFees > 0) {
        const netIncomeAfterFees = data.totalIncome - data.totalFees;
        incomeRows.push(
          [{ content: 'Less: Processing Fees', styles: { textColor: [234, 88, 12] } }, { content: `-${formatCurrency(data.totalFees)}`, styles: { textColor: [234, 88, 12] } }],
          [{ content: 'Net Income', styles: { fontStyle: 'bold', textColor: [22, 163, 74] } }, { content: formatCurrency(netIncomeAfterFees), styles: { fontStyle: 'bold', textColor: [22, 163, 74] } }],
        );
      }
      autoTable(doc, {
        startY: yPos,
        body: incomeRows,
        margin: { left: 14, right: 14 },
        theme: 'striped',
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yPos = ((doc as any).lastAutoTable?.finalY ?? yPos + 40) + 12;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Expenses by Category', 14, yPos);
      yPos += 3;
      autoTable(doc, {
        startY: yPos,
        body: [
          ...Object.entries(data.expenseByCategory).map(([cat, amount]) => [cat, formatCurrency(amount)]),
          [{ content: 'Total Expenses', styles: { fontStyle: 'bold' as const } }, { content: formatCurrency(data.totalExpenses), styles: { fontStyle: 'bold' as const, textColor: [220, 38, 38] } }],
        ],
        margin: { left: 14, right: 14 },
        theme: 'striped',
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yPos = ((doc as any).lastAutoTable?.finalY ?? yPos + 40) + 12;
      const netIncomeAfterFees = data.totalIncome - data.totalFees;
      autoTable(doc, {
        startY: yPos,
        body: [
          ['Gross Income', formatCurrency(data.totalIncome)],
          ...(data.totalFees > 0 ? [['Less: Processing Fees', `-${formatCurrency(data.totalFees)}`], ['Net Income', formatCurrency(netIncomeAfterFees)]] : []),
          ['Less: Expenses', `-${formatCurrency(data.totalExpenses)}`],
          [{ content: 'Net Surplus / Deficit', styles: { fontStyle: 'bold' as const } }, { content: formatCurrency(data.netIncome), styles: { fontStyle: 'bold' as const, textColor: data.netIncome >= 0 ? [22, 163, 74] : [220, 38, 38] } }],
        ],
        margin: { left: 14, right: 14 },
        theme: 'grid',
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
        styles: { fontSize: 11 },
      });

      if (data.eventSummary.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yPos = ((doc as any).lastAutoTable?.finalY ?? yPos + 40) + 12;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Event Summary', 14, yPos);
        yPos += 3;
        autoTable(doc, {
          startY: yPos,
          head: [['Event', 'Income', 'Expense', 'Profit/Loss']],
          body: data.eventSummary.map((e) => [
            e.eventName,
            formatCurrency(e.income),
            formatCurrency(e.expense),
            formatCurrency(e.profitLoss),
          ]),
          margin: { left: 14, right: 14 },
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        });
      }

      // Pending Money (only when no event filter)
      if (!eventFilter && (data.pendingReceivables > 0 || data.pendingPayables > 0)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yPos = ((doc as any).lastAutoTable?.finalY ?? yPos + 40) + 12;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Pending Money', 14, yPos);
        yPos += 3;
        autoTable(doc, {
          startY: yPos,
          body: [
            [{ content: 'Money to Receive', styles: { fillColor: [251, 191, 36] } }, { content: formatCurrency(data.pendingReceivables), styles: { fillColor: [251, 191, 36], fontStyle: 'bold' as const } }],
            [{ content: 'Bills to Pay', styles: { fillColor: [168, 85, 247] } }, { content: formatCurrency(data.pendingPayables), styles: { fillColor: [168, 85, 247], fontStyle: 'bold' as const } }],
          ],
          margin: { left: 14, right: 14 },
          theme: 'grid',
          columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
          styles: { fontSize: 11 },
        });
      }

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} | Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}-${dateRange.replace(/\s+/g, '-')}.pdf`);
  }, [activeReport, reportData, startDate, endDate, eventFilter, events]);

  return (
    <div>
      <PageHeader title="Financial Report" description="Comprehensive financial summary for any time period." />

      {/* Date and Event Controls */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <label className="text-sm font-medium">Period:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm py-1.5 w-auto" />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm font-medium">Event (optional):</label>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="input text-sm py-1.5 w-auto min-w-[200px]">
            <option value="">All Events (includes AR/AP)</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={fetchReport} className="btn btn-primary text-sm py-1.5">
            Generate Report
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {eventFilter ? 'Shows income/expenses for selected event only' : 'Shows all income/expenses plus money owed to us and bills outstanding'}
        </p>
      </div>

      {loading && <div className="card p-8 text-center text-gray-400">Loading report...</div>}

      {!loading && activeReport && reportData && (
        <>
          <div className="flex justify-end mb-2">
            <button onClick={handleDownloadPDF} className="btn btn-outline text-sm flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download PDF
            </button>
          </div>
          <AnnualSummaryReport data={reportData as AnnualReport} eventMode={!!eventFilter} />
        </>
      )}
    </div>
  );
}

function AnnualSummaryReport({ data: d, eventMode }: { data: AnnualReport; eventMode: boolean }) {
  const netIncomeAfterFees = d.totalIncome - d.totalFees;
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Annual Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Income Section */}
          <div>
            <h4 className="font-semibold text-sm mb-2 text-green-600">Income by Category (Gross)</h4>
            {Object.entries(d.incomeByCategory).map(([cat, amount]) => (
              <div key={cat} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800">
                <span>{cat}</span><span>{formatCurrency(amount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t-2 border-green-300">
              <span>Total Gross Income</span><span className="text-green-600">{formatCurrency(d.totalIncome)}</span>
            </div>

            {d.totalFees > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
                <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
                  <span>Less: Processing Fees</span><span>-{formatCurrency(d.totalFees)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-green-200">
                  <span>Net Income</span><span className="text-green-600">{formatCurrency(netIncomeAfterFees)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Expenses Section */}
          <div>
            <h4 className="font-semibold text-sm mb-2 text-red-600">Expenses by Category</h4>
            {Object.entries(d.expenseByCategory).length > 0 ? (
              Object.entries(d.expenseByCategory).map(([cat, amount]) => (
                <div key={cat} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-800">
                  <span>{cat}</span><span>{formatCurrency(amount)}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-400 py-1">No expenses</div>
            )}
            <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t-2 border-red-300">
              <span>Total Expenses</span><span className="text-red-600">{formatCurrency(d.totalExpenses)}</span>
            </div>
          </div>
        </div>

        {/* Net Surplus / Deficit */}
        <div className="mt-6 p-4 rounded-lg flex justify-between items-center" style={{ background: d.netIncome >= 0 ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
          <div>
            <div className="text-xs text-gray-500 uppercase">Net Surplus / Deficit</div>
            <div className={`text-2xl font-bold ${d.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(d.netIncome)}</div>
          </div>
          <div className="text-right text-sm text-gray-600 dark:text-gray-400">
            <div>Gross Income: {formatCurrency(d.totalIncome)}</div>
            {d.totalFees > 0 && <div>Less: Fees: -{formatCurrency(d.totalFees)}</div>}
            {d.totalFees > 0 && <div>Net Income: {formatCurrency(netIncomeAfterFees)}</div>}
            <div>Less: Expenses: -{formatCurrency(d.totalExpenses)}</div>
          </div>
        </div>
      </div>

      {d.eventSummary.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Event Summary</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="p-2 text-left font-semibold">Event</th>
                <th className="p-2 text-right font-semibold text-green-600">Income</th>
                <th className="p-2 text-right font-semibold text-red-600">Expense</th>
                <th className="p-2 text-right font-semibold">Profit/Loss</th>
              </tr>
            </thead>
            <tbody>
              {d.eventSummary.map((e) => (
                <tr key={e.eventName} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2 font-medium">{e.eventName}</td>
                  <td className="p-2 text-right text-green-600">{formatCurrency(e.income)}</td>
                  <td className="p-2 text-right text-red-600">{formatCurrency(e.expense)}</td>
                  <td className={`p-2 text-right font-semibold ${e.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(e.profitLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!eventMode && (d.pendingReceivables > 0 || d.pendingPayables > 0) && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Pending Money</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <div className="text-xs text-gray-500 uppercase">Money to Receive</div>
              <div className="text-xl font-bold text-amber-600">{formatCurrency(d.pendingReceivables)}</div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-xs text-gray-500 uppercase">Bills to Pay</div>
              <div className="text-xl font-bold text-purple-600">{formatCurrency(d.pendingPayables)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
