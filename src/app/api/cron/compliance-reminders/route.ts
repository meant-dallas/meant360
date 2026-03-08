import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { orgInfoRepository, orgOfficerRepository } from '@/repositories';
import { sendEmail } from '@/services/email.service';
import { logActivity } from '@/lib/audit-log';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Reminders are sent at these thresholds (days before due date)
const REMINDER_DAYS = [30, 14, 7, 1];
const REMINDER_GROUPS = ['BoD'];

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const [orgInfo, allOfficers] = await Promise.all([
      orgInfoRepository.get(),
      orgOfficerRepository.findAll({ status: 'Active' }),
    ]);

    if (!orgInfo) {
      return jsonResponse({ skipped: true, reason: 'No organization info configured' });
    }

    const recipients = allOfficers.filter(
      (o) => REMINDER_GROUPS.includes(o.group) && o.email,
    );

    if (recipients.length === 0) {
      return jsonResponse({ skipped: true, reason: 'No eligible officers with email' });
    }

    const deadlines = [
      { key: 'franchiseTaxDueDate', label: 'Texas Franchise Tax Report', date: orgInfo.franchiseTaxDueDate },
      { key: 'publicInfoReportDueDate', label: 'Public Information Report', date: orgInfo.publicInfoReportDueDate },
      { key: 'irs990DueDate', label: 'IRS Form 990', date: orgInfo.irs990DueDate },
    ];

    // Find deadlines that match a reminder threshold today
    const actionableDeadlines = deadlines.filter((d) => {
      if (!d.date) return false;
      const days = daysUntil(d.date);
      if (days === null) return false;
      // Send if exactly on a threshold day, or if overdue (once, on the due date itself = day 0)
      return REMINDER_DAYS.includes(days) || days === 0;
    });

    if (actionableDeadlines.length === 0) {
      return jsonResponse({ skipped: true, reason: 'No deadlines due at reminder thresholds today' });
    }

    const orgName = orgInfo.publicName || orgInfo.legalName || 'the organization';
    const toEmails = recipients.map((r) => r.email);

    const deadlineRows = actionableDeadlines.map((d) => {
      const days = daysUntil(d.date);
      const urgency = days !== null && days <= 0 ? 'OVERDUE'
        : days !== null && days <= 7 ? 'URGENT'
        : '';
      const urgencyBadge = urgency === 'OVERDUE'
        ? '<span style="color:#dc2626;font-weight:600"> — DUE TODAY</span>'
        : urgency === 'URGENT'
        ? '<span style="color:#d97706;font-weight:600"> — Due Soon</span>'
        : '';
      const daysText = days !== null
        ? (days === 0 ? 'Due today!' : `${days} days remaining`)
        : '';
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:14px;">${d.label}${urgencyBadge}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:14px;">${formatDate(d.date)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">${daysText}</td>
        </tr>`;
    }).join('');

    const recipientNames = recipients.map((r) => `${r.name} (${r.role})`).join(', ');

    const htmlBody = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
        <div style="padding:24px 0;border-bottom:1px solid #e5e7eb;">
          <h2 style="margin:0;font-size:20px;color:#111827;">Compliance Filing Reminder</h2>
          <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${orgName} — Automated Reminder</p>
        </div>

        <div style="padding:20px 0;">
          <p style="font-size:14px;color:#374151;line-height:1.6;">
            This is an automated reminder about upcoming compliance filing deadlines for ${orgName}.
            Please review and ensure timely filing.
          </p>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Filing</th>
                <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Due Date</th>
                <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${deadlineRows}
            </tbody>
          </table>

          <p style="font-size:13px;color:#6b7280;line-height:1.6;">
            Sent to: ${recipientNames}
          </p>
        </div>

        <div style="padding:16px 0;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
          This is an automated reminder from the MEANT 360 admin portal. Reminders are sent at 30, 14, 7, and 1 day(s) before each deadline.
        </div>
      </div>
    `;

    const subject = actionableDeadlines.length === 1
      ? `Filing Reminder: ${actionableDeadlines[0].label} — Due ${formatDate(actionableDeadlines[0].date)}`
      : `Compliance Filing Reminders — ${orgName}`;

    const result = await sendEmail(toEmails, subject, htmlBody, 'system-cron');

    if (!result.success) {
      console.error('Cron reminder email failed:', result.error);
      return errorResponse(result.error || 'Failed to send', 500);
    }

    logActivity({
      userEmail: 'system-cron',
      action: 'create',
      entityType: 'OrgReminder',
      entityId: 'cron-compliance',
      entityLabel: 'Automated Compliance Reminder',
      description: `Auto-sent filing reminder to ${recipientNames} for: ${actionableDeadlines.map((d) => d.label).join(', ')}`,
    });

    return jsonResponse({
      sent: true,
      recipients: recipients.map((r) => ({ name: r.name, role: r.role })),
      deadlines: actionableDeadlines.map((d) => ({ label: d.label, daysUntil: daysUntil(d.date) })),
    });
  } catch (error) {
    console.error('Cron compliance-reminders error:', error);
    return errorResponse('Cron job failed', 500, error);
  }
}
