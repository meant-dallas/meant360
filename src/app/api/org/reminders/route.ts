import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAdmin } from '@/lib/api-helpers';
import { orgInfoRepository, orgOfficerRepository } from '@/repositories';
import { sendEmail } from '@/services/email.service';
import { logActivity } from '@/lib/audit-log';
import { formatDate, daysUntilCST } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

const REMINDER_GROUPS = ['BoD'];

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const deadlineField = body.deadline as string | undefined;

    // Fetch org info and officers
    const [orgInfo, allOfficers] = await Promise.all([
      orgInfoRepository.get(),
      orgOfficerRepository.findAll({ status: 'Active' }),
    ]);

    if (!orgInfo) return errorResponse('Organization info not configured');

    // Get recipients: active BoD officers with valid email
    const recipients = allOfficers.filter(
      (o) => REMINDER_GROUPS.includes(o.group) && o.email,
    );

    if (recipients.length === 0) {
      return errorResponse('No active BoD members with email addresses found');
    }

    // Build deadline list
    const deadlines = [
      { key: 'franchiseTaxDueDate', label: 'Texas Franchise Tax Report', date: orgInfo.franchiseTaxDueDate },
      { key: 'publicInfoReportDueDate', label: 'Public Information Report', date: orgInfo.publicInfoReportDueDate },
      { key: 'irs990DueDate', label: 'IRS Form 990', date: orgInfo.irs990DueDate },
    ];

    // Filter to specific deadline if requested, otherwise send all upcoming
    const targetDeadlines = deadlineField
      ? deadlines.filter((d) => d.key === deadlineField && d.date)
      : deadlines.filter((d) => d.date);

    if (targetDeadlines.length === 0) {
      return errorResponse('No deadlines configured to send reminders for');
    }

    const orgName = orgInfo.publicName || orgInfo.legalName || 'the organization';
    const toEmails = recipients.map((r) => r.email);

    // Build email
    const deadlineRows = targetDeadlines.map((d) => {
      const days = daysUntilCST(d.date);
      const urgency = days !== null && days < 0 ? 'OVERDUE' :
                      days !== null && days <= 30 ? 'URGENT' : '';
      const urgencyBadge = urgency === 'OVERDUE'
        ? '<span style="color:#dc2626;font-weight:600"> — OVERDUE</span>'
        : urgency === 'URGENT'
        ? '<span style="color:#d97706;font-weight:600"> — Due Soon</span>'
        : '';
      const daysText = days !== null
        ? (days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days remaining`)
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
          <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${orgName}</p>
        </div>

        <div style="padding:20px 0;">
          <p style="font-size:14px;color:#374151;line-height:1.6;">
            This is a reminder about upcoming compliance filing deadlines for ${orgName}.
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
          This reminder was sent from the MEANT 360 admin portal by ${auth.email}.
        </div>
      </div>
    `;

    const subject = targetDeadlines.length === 1
      ? `Filing Reminder: ${targetDeadlines[0].label} — Due ${formatDate(targetDeadlines[0].date)}`
      : `Compliance Filing Reminders — ${orgName}`;

    const result = await sendEmail(toEmails, subject, htmlBody, auth.email);

    if (!result.success) {
      return errorResponse(result.error || 'Failed to send reminder email');
    }

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'OrgReminder',
      entityId: 'compliance-deadline',
      entityLabel: 'Compliance Reminder',
      description: `Sent filing reminder to ${recipientNames}`,
    });

    return jsonResponse({
      sent: true,
      recipients: recipients.map((r) => ({ name: r.name, role: r.role, email: r.email })),
      deadlines: targetDeadlines.map((d) => d.label),
    });
  } catch (error) {
    console.error('POST /api/org/reminders error:', error);
    Sentry.captureException(error, { extra: { context: 'Org reminders POST' } });
    return errorResponse('Failed to send reminder', 500, error);
  }
}
