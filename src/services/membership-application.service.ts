import { membershipApplicationRepository, committeeRepository, settingRepository } from '@/repositories';
import { memberService } from './members.service';
import { sendEmail } from './email.service';
import { logActivity } from '@/lib/audit-log';

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

const DEFAULT_REQUIRED_APPROVALS = 3;

async function getRequiredApprovals(): Promise<number> {
  const settings = await settingRepository.getAll();
  const value = parseInt(settings['membership_required_approvals'] || '', 10);
  return isNaN(value) || value < 1 ? DEFAULT_REQUIRED_APPROVALS : value;
}

async function getBoDEmails(): Promise<{ email: string; name: string }[]> {
  const members = await committeeRepository.findAll();
  return members
    .filter((m) => m.designation === 'BoD')
    .map((m) => ({ email: m.email, name: m.name }));
}

function buildNotificationEmail(app: Record<string, string>): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();
  return {
    subject: `New Membership Application: ${name}`,
    html: `
      <h2>New Membership Application</h2>
      <p><strong>${name}</strong> has submitted a membership application.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Email:</td><td>${app.email}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Phone:</td><td>${app.phone || app.cellPhone || app.homePhone || '-'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Native Place:</td><td>${app.nativePlace || '-'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Employer:</td><td>${app.employer || '-'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Amount Paid:</td><td>$${app.amountPaid || '0'}</td></tr>
      </table>
      <p>Please log in to the admin dashboard to review and approve or reject this application.</p>
      <p style="margin:24px 0">
        <a href="${APP_URL}/membership-applications" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
          Review Applications
        </a>
      </p>
    `,
  };
}

function buildWelcomeEmail(app: Record<string, string>): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();
  return {
    subject: 'Welcome to MEANT!',
    html: `
      <h2>Welcome to MEANT, ${name}!</h2>
      <p>Your membership application has been approved by the Board of Directors.</p>
      <p>You are now an official member of the Malayalee Engineers' Association of North Texas.</p>
      <p>We look forward to seeing you at our upcoming events!</p>
    `,
  };
}

function buildConfirmationEmail(app: Record<string, string>): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();
  return {
    subject: 'MEANT Membership Application Received',
    html: `
      <h2>Application Received</h2>
      <p>Dear ${name},</p>
      <p>Thank you for submitting your membership application to the Malayalee Engineers' Association of North Texas (MEANT).</p>
      <p>Your application has been received and will be reviewed by the Board of Directors. You will be notified once a decision has been made.</p>
      <p>If you have any questions, please don't hesitate to reach out.</p>
      <p>Best regards,<br/>MEANT Team</p>
    `,
  };
}

function buildRejectionEmail(app: Record<string, string>, reason: string): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();
  return {
    subject: 'MEANT Membership Application Update',
    html: `
      <h2>Membership Application Update</h2>
      <p>Dear ${name},</p>
      <p>After careful review, the Board of Directors was unable to approve your membership application at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>If you have questions, please contact us for more information.</p>
    `,
  };
}

export const membershipApplicationService = {
  async submitApplication(data: Record<string, unknown>): Promise<Record<string, string>> {
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) throw new Error('Email is required');

    // Check for duplicate pending application
    const existing = await membershipApplicationRepository.findByEmail(email);
    const hasPending = existing.some((a) => a.status === 'Pending');
    if (hasPending) {
      throw new Error('A pending application already exists for this email address');
    }

    const now = new Date().toISOString();
    const record = await membershipApplicationRepository.create({
      firstName: String(data.firstName || ''),
      middleName: String(data.middleName || ''),
      lastName: String(data.lastName || ''),
      email,
      phone: String(data.phone || ''),
      homePhone: String(data.homePhone || ''),
      cellPhone: String(data.cellPhone || ''),
      qualifyingDegree: String(data.qualifyingDegree || ''),
      nativePlace: String(data.nativePlace || ''),
      college: String(data.college || ''),
      jobTitle: String(data.jobTitle || ''),
      employer: String(data.employer || ''),
      specialInterests: String(data.specialInterests || ''),
      address: data.address || null,
      spouse: data.spouse || null,
      children: data.children || null,
      membershipType: String(data.membershipType || ''),
      sponsorName: String(data.sponsorName || ''),
      sponsorEmail: String(data.sponsorEmail || ''),
      sponsorPhone: String(data.sponsorPhone || ''),
      amountPaid: String(data.amountPaid || '0'),
      paymentMethod: String(data.paymentMethod || ''),
      transactionId: String(data.transactionId || ''),
      paymentStatus: String(data.paymentStatus || ''),
      approvals: [],
      approvalCount: 0,
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
    });

    // Fire-and-forget: notify all BoD members
    getBoDEmails().then(async (bodMembers) => {
      if (bodMembers.length === 0) return;
      const { subject, html } = buildNotificationEmail(record);
      const emails = bodMembers.map((b) => b.email);
      await sendEmail(emails, subject, html, 'system').catch((err) =>
        console.error('Failed to send BoD notification:', err),
      );
    });

    // Fire-and-forget: send confirmation email to applicant
    const { subject: confirmSubject, html: confirmHtml } = buildConfirmationEmail(record);
    sendEmail([email], confirmSubject, confirmHtml, 'system').catch((err) =>
      console.error('Failed to send applicant confirmation:', err),
    );

    logActivity({
      userEmail: email,
      action: 'create',
      entityType: 'MembershipApplication',
      entityId: record.id,
      entityLabel: `${data.firstName} ${data.lastName}`,
      description: 'Membership application submitted',
    });

    return record;
  },

  async approveApplication(
    id: string,
    approverEmail: string,
    approverName: string,
  ): Promise<Record<string, string>> {
    const app = await membershipApplicationRepository.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'Pending') throw new Error('Application is not in Pending status');

    // Parse existing approvals
    let approvals: Array<{ email: string; name: string; date: string }> = [];
    try {
      approvals = JSON.parse(app.approvals || '[]');
    } catch {
      approvals = [];
    }

    // Check for duplicate approval
    if (approvals.some((a) => a.email === approverEmail)) {
      throw new Error('You have already approved this application');
    }

    approvals.push({ email: approverEmail, name: approverName, date: new Date().toISOString() });
    const approvalCount = approvals.length;
    const now = new Date().toISOString();
    const requiredApprovals = await getRequiredApprovals();

    const updateData: Record<string, unknown> = {
      approvals,
      approvalCount,
      updatedAt: now,
    };

    // On reaching required approvals, auto-create member
    if (approvalCount >= requiredApprovals) {
      updateData.status = 'Approved';

      // Create the member record
      const address = (() => { try { return JSON.parse(app.address || '{}'); } catch { return {}; } })();
      const spouse = (() => { try { return JSON.parse(app.spouse || '{}'); } catch { return {}; } })();
      const children = (() => { try { return JSON.parse(app.children || '[]'); } catch { return []; } })();

      const currentYear = new Date().getFullYear().toString();
      const memberData: Record<string, unknown> = {
        firstName: app.firstName,
        middleName: app.middleName,
        lastName: app.lastName,
        email: app.email,
        phone: app.phone,
        homePhone: app.homePhone,
        cellPhone: app.cellPhone,
        qualifyingDegree: app.qualifyingDegree,
        nativePlace: app.nativePlace,
        college: app.college,
        jobTitle: app.jobTitle,
        employer: app.employer,
        specialInterests: app.specialInterests,
        membershipType: app.membershipType === 'Life Membership' ? 'Life Member' : 'Yearly',
        status: 'Active',
        address,
        spouse,
        children,
        membershipYears: [{ year: currentYear, status: 'Active' }],
        payments: app.amountPaid && app.amountPaid !== '0' ? [{
          product: `Membership ${currentYear}`,
          amount: app.amountPaid,
          payerName: `${app.firstName} ${app.lastName}`.trim(),
          payerEmail: app.email,
          transactionId: app.transactionId,
        }] : [],
      };

      const member = await memberService.create(memberData, { userEmail: approverEmail });
      updateData.memberId = member.id;

      // Send welcome email
      const { subject, html } = buildWelcomeEmail(app);
      sendEmail([app.email], subject, html, 'system').catch((err) =>
        console.error('Failed to send welcome email:', err),
      );
    }

    const updated = await membershipApplicationRepository.update(id, updateData);

    logActivity({
      userEmail: approverEmail,
      action: 'update',
      entityType: 'MembershipApplication',
      entityId: id,
      entityLabel: `${app.firstName} ${app.lastName}`,
      description: `Application approved (${approvalCount}/${requiredApprovals})${approvalCount >= requiredApprovals ? ' - Member created' : ''}`,
    });

    return updated;
  },

  async rejectApplication(
    id: string,
    rejectorEmail: string,
    reason: string,
  ): Promise<Record<string, string>> {
    const app = await membershipApplicationRepository.findById(id);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'Pending') throw new Error('Application is not in Pending status');

    const now = new Date().toISOString();
    const updated = await membershipApplicationRepository.update(id, {
      status: 'Rejected',
      rejectedBy: rejectorEmail,
      rejectedReason: reason,
      updatedAt: now,
    });

    // Send rejection email
    const { subject, html } = buildRejectionEmail(app, reason);
    sendEmail([app.email], subject, html, 'system').catch((err) =>
      console.error('Failed to send rejection email:', err),
    );

    logActivity({
      userEmail: rejectorEmail,
      action: 'update',
      entityType: 'MembershipApplication',
      entityId: id,
      entityLabel: `${app.firstName} ${app.lastName}`,
      description: 'Application rejected',
    });

    return updated;
  },

  async listApplications(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    return membershipApplicationRepository.findAll(filters);
  },

  async getApplication(id: string): Promise<Record<string, string>> {
    const app = await membershipApplicationRepository.findById(id);
    if (!app) throw new Error('Application not found');
    return app;
  },
};
