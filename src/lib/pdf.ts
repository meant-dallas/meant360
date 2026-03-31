import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './utils';

// ========================================
// PDF Report Generation
// ========================================

interface ReportHeader {
  title: string;
  subtitle?: string;
  dateRange?: string;
  orgName?: string;
}

function addHeader(doc: jsPDF, header: ReportHeader) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(header.orgName || 'Nonprofit Association', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(14);
  doc.text(header.title, pageWidth / 2, 30, { align: 'center' });

  if (header.subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(header.subtitle, pageWidth / 2, 37, { align: 'center' });
  }

  if (header.dateRange) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(header.dateRange, pageWidth / 2, 43, { align: 'center' });
  }

  doc.setLineWidth(0.5);
  doc.line(14, 47, pageWidth - 14, 47);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    );
  }
}

function getLastTableY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? fallback;
}

/** Render the standard summary table: Participation, Sponsorship, Expenses, Profit/Loss. */
function addSummaryTable(doc: jsPDF, yPos: number, participation: number, sponsorship: number, expenses: number) {
  const profitLoss = participation + sponsorship - expenses;

  autoTable(doc, {
    startY: yPos,
    body: [
      ['Participation Income', formatCurrency(participation)],
      ['Sponsorship Income', formatCurrency(sponsorship)],
      ['Total Expenses', formatCurrency(expenses)],
      [
        { content: profitLoss >= 0 ? 'Profit' : 'Loss', styles: { fontStyle: 'bold' } },
        { content: formatCurrency(profitLoss), styles: { fontStyle: 'bold', textColor: profitLoss >= 0 ? [16, 185, 129] : [239, 68, 68] } },
      ],
    ],
    margin: { left: 14, right: 14 },
    theme: 'striped',
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
    styles: { fontSize: 11 },
  });
}

// --- Event Report ---

export interface EventReportData {
  eventName: string;
  eventDate: string;
  participationIncome: number;
  sponsorshipIncome: number;
  totalExpenses: number;
  totalRegistered?: number;
  totalAttended?: number;
}

export function generateEventReport(data: EventReportData): ArrayBuffer {
  const doc = new jsPDF();

  addHeader(doc, {
    title: 'Event Financial Report',
    subtitle: data.eventName,
    dateRange: data.eventDate ? `Event Date: ${formatDate(data.eventDate)}` : undefined,
  });

  let yPos = 55;

  // Attendance Summary
  if (data.totalRegistered !== undefined || data.totalAttended !== undefined) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Attendance Summary', 14, yPos);

    autoTable(doc, {
      startY: yPos + 3,
      body: [
        ['Registered', String(data.totalRegistered ?? 0)],
        ['Attended (Checked In)', String(data.totalAttended ?? 0)],
      ],
      margin: { left: 14, right: 14 },
      theme: 'striped',
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      styles: { fontSize: 11 },
    });

    yPos = getLastTableY(doc, yPos + 30) + 15;
  }

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Summary', 14, yPos);

  addSummaryTable(doc, yPos + 3, data.participationIncome, data.sponsorshipIncome, data.totalExpenses);

  addFooter(doc);
  return doc.output('arraybuffer');
}

// --- Event Registration Report ---

export interface RegistrationReportParticipant {
  name: string;
  email: string;
  phone: string;
  type: string;
  registeredAdults: string;
  registeredKids: string;
  attendeeNames: string;
  selectedActivities: string;
  registrationStatus: string;
  emailConsent: string;
  mediaConsent: string;
  registeredAt: string;
  customFields?: string;
}

export interface RegistrationReportFormField {
  id: string;
  label: string;
}

export interface RegistrationReportData {
  eventName: string;
  eventDate: string;
  participants: RegistrationReportParticipant[];
  formFields?: RegistrationReportFormField[];
}

export function generateRegistrationReport(data: RegistrationReportData): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape' });

  addHeader(doc, {
    title: 'Event Registration Report',
    subtitle: data.eventName,
    dateRange: data.eventDate ? `Event Date: ${formatDate(data.eventDate)}` : undefined,
  });

  let yPos = 55;

  const total = data.participants.length;
  const members = data.participants.filter(p => p.type === 'Member').length;
  const guests = total - members;
  const confirmed = data.participants.filter(p => (p.registrationStatus || 'confirmed') === 'confirmed').length;
  const waitlisted = data.participants.filter(p => p.registrationStatus === 'waitlist').length;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total: ${total} | Members: ${members} | Guests: ${guests} | Confirmed: ${confirmed} | Waitlisted: ${waitlisted}`, 14, yPos);
  yPos += 8;

  const formFields = data.formFields || [];
  const baseHeaders = ['Name', 'Email', 'Phone', 'Type', 'Adults', 'Kids', 'Attendees', 'Activities', 'Status', 'Email OK', 'Media OK', 'Registered'];
  const customHeaders = formFields.map(f => f.label);
  const headers = [...baseHeaders, ...customHeaders];

  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: data.participants.map((p) => {
      let activities = '';
      try {
        const parsed = JSON.parse(p.selectedActivities || '[]');
        activities = Array.isArray(parsed) ? parsed.map((a: { activityId?: string }) => a.activityId || '').filter(Boolean).join(', ') : '';
      } catch { activities = ''; }

      let attendees = '';
      try {
        const parsed = JSON.parse(p.attendeeNames || '[]');
        attendees = Array.isArray(parsed) ? parsed.join(', ') : p.attendeeNames;
      } catch { attendees = p.attendeeNames || ''; }

      let cfData: Record<string, string> = {};
      try { cfData = p.customFields ? JSON.parse(p.customFields) : {}; } catch { cfData = {}; }

      const baseRow = [
        p.name, p.email, p.phone || '', p.type,
        p.registeredAdults || '0', p.registeredKids || '0',
        attendees, activities,
        p.registrationStatus || 'confirmed',
        p.emailConsent === 'true' ? 'Yes' : 'No',
        p.mediaConsent === 'true' ? 'Yes' : 'No',
        p.registeredAt ? formatDate(p.registeredAt) : '',
      ];
      const customValues = formFields.map(f => cfData[f.id] || '');
      return [...baseRow, ...customValues];
    }),
    margin: { left: 10, right: 10 },
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 40 }, 6: { cellWidth: 35 }, 7: { cellWidth: 30 } },
  });

  addFooter(doc);
  return doc.output('arraybuffer');
}

// --- Monthly Treasurer Report ---

export interface MembershipStats {
  totalMembers: number;
  activeMembers: number;
  newMembers: number;
  renewedMembers: number;
}

export interface MonthlyReportData {
  month: string;
  year: number;
  beginningBalance: number;
  participationIncome: number;
  sponsorshipIncome: number;
  totalExpenses: number;
  membershipStats?: MembershipStats;
}

export function generateMonthlyReport(data: MonthlyReportData): ArrayBuffer {
  const doc = new jsPDF();

  addHeader(doc, {
    title: 'Monthly Treasurer Report',
    subtitle: `${data.month} ${data.year}`,
  });

  let yPos = 55;

  const totalRevenue = data.participationIncome + data.sponsorshipIncome;
  const profitLoss = totalRevenue - data.totalExpenses;
  const endingBalance = data.beginningBalance + profitLoss;

  // Beginning Balance
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Beginning Balance: ${formatCurrency(data.beginningBalance)}`, 14, yPos);
  yPos += 10;

  // Summary
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Summary', 14, yPos);
  yPos += 3;

  addSummaryTable(doc, yPos, data.participationIncome, data.sponsorshipIncome, data.totalExpenses);

  yPos = getLastTableY(doc, yPos + 50) + 15;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Ending Balance: ${formatCurrency(endingBalance)}`, 14, yPos);

  // Membership Stats
  if (data.membershipStats) {
    yPos += 15;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Membership Summary', 14, yPos);

    autoTable(doc, {
      startY: yPos + 3,
      body: [
        ['Total Members', String(data.membershipStats.totalMembers)],
        ['Active Members', String(data.membershipStats.activeMembers)],
        ['New Members (This Period)', String(data.membershipStats.newMembers)],
        ['Renewed Members (This Period)', String(data.membershipStats.renewedMembers)],
      ],
      margin: { left: 14, right: 14 },
      theme: 'striped',
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      styles: { fontSize: 11 },
    });
  }

  addFooter(doc);
  return doc.output('arraybuffer');
}

// --- Annual Report ---

export interface ReportMonthlySummary {
  month: string;
  participation: number;
  sponsorship: number;
  expenses: number;
  net: number;
}

export interface ReportEventSummary {
  eventName: string;
  participation: number;
  sponsorship: number;
  expenses: number;
  net: number;
}

export interface AnnualReportData {
  year: number;
  participationIncome: number;
  sponsorshipIncome: number;
  totalExpenses: number;
  monthlySummary: ReportMonthlySummary[];
  eventSummaries: ReportEventSummary[];
  membershipStats?: MembershipStats;
}

export function generateAnnualReport(data: AnnualReportData): ArrayBuffer {
  const doc = new jsPDF();

  addHeader(doc, {
    title: 'Annual Financial Report',
    subtitle: `Financial Year ${data.year}`,
    dateRange: `January 1 – December 31, ${data.year}`,
  });

  // Executive Summary
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', 14, 55);

  addSummaryTable(doc, 58, data.participationIncome, data.sponsorshipIncome, data.totalExpenses);

  let yPos = getLastTableY(doc, 110) + 15;

  // Membership Summary
  if (data.membershipStats) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Membership Summary', 14, yPos);

    autoTable(doc, {
      startY: yPos + 3,
      body: [
        ['Total Members', String(data.membershipStats.totalMembers)],
        ['Active Members', String(data.membershipStats.activeMembers)],
        ['New Members (This Year)', String(data.membershipStats.newMembers)],
        ['Renewed Members (This Year)', String(data.membershipStats.renewedMembers)],
      ],
      margin: { left: 14, right: 14 },
      theme: 'striped',
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
      styles: { fontSize: 11 },
    });

    yPos = getLastTableY(doc, yPos + 50) + 15;
  }

  // Monthly Summary
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Summary', 14, yPos);

  autoTable(doc, {
    startY: yPos + 3,
    head: [['Month', 'Participation', 'Sponsorship', 'Expenses', 'Net']],
    body: data.monthlySummary.map((m) => [
      m.month,
      formatCurrency(m.participation),
      formatCurrency(m.sponsorship),
      formatCurrency(m.expenses),
      formatCurrency(m.net),
    ]),
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [107, 114, 128] },
  });

  // Event Summaries
  if (data.eventSummaries.length > 0) {
    const evtY = getLastTableY(doc, 200) + 15;

    // Add new page if not enough space
    if (evtY > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    } else {
      yPos = evtY;
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Event Summaries', 14, yPos);

    autoTable(doc, {
      startY: yPos + 3,
      head: [['Event', 'Participation', 'Sponsorship', 'Expenses', 'Net']],
      body: data.eventSummaries.map((e) => [
        e.eventName,
        formatCurrency(e.participation),
        formatCurrency(e.sponsorship),
        formatCurrency(e.expenses),
        formatCurrency(e.net),
      ]),
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] },
    });
  }

  addFooter(doc);
  return doc.output('arraybuffer');
}
