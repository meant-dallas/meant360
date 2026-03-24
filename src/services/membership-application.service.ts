import { membershipApplicationRepository, orgOfficerRepository, settingRepository, incomeRepository } from '@/repositories';
import { memberService } from './members.service';
import { sendEmail } from './email.service';
import { logActivity } from '@/lib/audit-log';
import { getAppUrl } from '@/lib/app-url';
import { generateId } from '@/lib/utils';
import { parseMembershipPlan } from './events.service';
import {
  emailLayout,
  sectionCard,
  highlightBox,
  detailsTable,
  memberDetailsSection,
  membershipInfoBox,
  spouseSection,
  childrenSection,
  sponsorSection,
  whatsappSection,
  socialMediaSection,
  actionButton,
  getSpouseEmail,
} from '@/lib/email-templates';

const DEFAULT_REQUIRED_APPROVALS = 3;

async function getRequiredApprovals(): Promise<number> {
  const settings = await settingRepository.getAll();
  const value = parseInt(settings['membership_required_approvals'] || '', 10);
  return isNaN(value) || value < 1 ? DEFAULT_REQUIRED_APPROVALS : value;
}

async function getBoDEmails(): Promise<{ email: string; name: string }[]> {
  const officers = await orgOfficerRepository.findAll({ status: 'Active' });
  return officers
    .filter((o) => o.group === 'BoD' && o.email)
    .map((o) => ({ email: o.email, name: o.name }));
}

async function requireBoDMember(email: string): Promise<void> {
  const officers = await orgOfficerRepository.findAll({ status: 'Active' });
  const isBoD = officers.some((o) => o.group === 'BoD' && o.email.toLowerCase() === email.toLowerCase());
  if (!isBoD) {
    throw new Error('Only Board of Directors members can perform this action');
  }
}

async function getSocialLinks() {
  const settings = await settingRepository.getAll();
  return {
    instagram: settings['social_instagram'] || '',
    facebook: settings['social_facebook'] || '',
    linkedin: settings['social_linkedin'] || '',
    youtube: settings['social_youtube'] || '',
  };
}

// ========================================
// Email Builders
// ========================================

/**
 * Confirmation email sent to applicant (and spouse) when application is submitted.
 */
function buildConfirmationEmail(app: Record<string, string>): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Dear <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      Thank you for submitting your membership application to the <strong>Malayalee Engineers' Association of North Texas (MEANT)</strong>.
      Your application has been received and will be reviewed by the Board of Directors.
    </p>

    ${highlightBox(`
      <h3 style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px;">Application Status</h3>
      <p style="font-size:16px;font-weight:700;color:#d97706;margin:0;">Pending Review</p>
      <p style="font-size:13px;color:#78716c;margin:4px 0 0;">You will be notified via email once a decision has been made.</p>
    `, 'amber')}

    ${membershipInfoBox(app)}

    ${sectionCard('Your Application Details', memberDetailsSection(app))}
    ${spouseSection(app)}
    ${childrenSection(app)}
    ${sponsorSection(app)}

    <p style="font-size:14px;color:#475569;line-height:1.6;margin:20px 0 0;">
      If you have any questions about your application, please don't hesitate to reach out to us.
    </p>
  `;

  return {
    subject: 'MEANT Membership Application Received',
    html: emailLayout({
      headerTitle: 'Application Received',
      headerSubtitle: "Malayalee Engineers' Association of North Texas",
      body,
    }),
  };
}

/**
 * Notification email sent to Board of Directors when a new application is submitted.
 */
function buildBoDNotificationEmail(app: Record<string, string>): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();
  const appUrl = getAppUrl();

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Dear Board Member,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      A new membership application has been submitted and requires your review.
    </p>

    ${highlightBox(`
      <h3 style="font-size:14px;font-weight:700;color:#1e40af;margin:0 0 8px;">New Application</h3>
      <p style="font-size:18px;font-weight:700;color:#1e293b;margin:0;">${name}</p>
      <p style="font-size:13px;color:#64748b;margin:4px 0 0;">${app.email} | ${app.membershipType || 'Standard'}</p>
    `, 'blue')}

    ${membershipInfoBox(app)}

    ${sectionCard('Applicant Details', memberDetailsSection(app))}
    ${spouseSection(app)}
    ${childrenSection(app)}
    ${sponsorSection(app)}

    ${actionButton('Review Applications', `${appUrl}/membership-applications`)}

    <p style="font-size:13px;color:#64748b;text-align:center;margin:0;">
      Please log in to the admin dashboard to approve or reject this application.
    </p>
  `;

  return {
    subject: `New Membership Application: ${name}`,
    html: emailLayout({
      headerTitle: 'New Application Received',
      headerSubtitle: 'Action Required - Board Review',
      headerColor: 'linear-gradient(135deg,#1e40af,#3b82f6)',
      body,
    }),
  };
}

/**
 * Welcome email sent to approved member (and spouse) with community links.
 */
function buildWelcomeEmail(
  app: Record<string, string>,
  socialLinks: { instagram: string; facebook: string; linkedin: string; youtube: string },
): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Hello <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 8px;">
      Thank you for your interest in joining <strong>MEANT Inc.</strong> and we would like to inform you that your Membership Application has been approved.
    </p>

    ${highlightBox(`
      <p style="font-size:22px;text-align:center;margin:0;color:#16a34a;font-weight:700;">
        Congratulations!!!
      </p>
      <p style="font-size:14px;text-align:center;color:#166534;margin:8px 0 0;">
        Welcome to MEANT. We are excited to have you as a member!
      </p>
    `, 'green')}

    ${membershipInfoBox(app)}

    ${sectionCard('Your Membership Details', memberDetailsSection(app))}
    ${spouseSection(app)}
    ${childrenSection(app)}
    ${sponsorSection(app)}

    ${whatsappSection()}
    ${socialMediaSection(socialLinks)}
  `;

  return {
    subject: 'Congratulations! Welcome to MEANT!',
    html: emailLayout({
      headerTitle: 'Welcome to MEANT!',
      headerSubtitle: "Malayalee Engineers' Association of North Texas",
      headerColor: 'linear-gradient(135deg,#166534,#16a34a)',
      body,
    }),
  };
}

/**
 * Notification email sent to Board of Directors when a member is approved.
 */
function buildBoDApprovalNotificationEmail(
  app: Record<string, string>,
  approverName: string,
  approvalCount: number,
  requiredApprovals: number,
): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Dear Board Member,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      A membership application has been <strong>approved</strong> and the member has been added to the system.
    </p>

    ${highlightBox(`
      <h3 style="font-size:14px;font-weight:700;color:#166534;margin:0 0 8px;">Member Approved</h3>
      <p style="font-size:18px;font-weight:700;color:#1e293b;margin:0;">${name}</p>
      ${detailsTable([
        ['Membership Type', app.membershipType || 'Standard'],
        ['Approved By', approverName],
        ['Approvals', `${approvalCount}/${requiredApprovals}`],
        app.amountPaid && app.amountPaid !== '0' ? ['Amount Paid', `$${app.amountPaid}`] : null,
      ])}
    `, 'green')}

    ${sectionCard('Member Details', memberDetailsSection(app))}
    ${spouseSection(app)}

    ${actionButton('View Members', `${getAppUrl()}/members`)}
  `;

  return {
    subject: `Membership Approved: ${name}`,
    html: emailLayout({
      headerTitle: 'Member Approved',
      headerSubtitle: 'Board Notification',
      headerColor: 'linear-gradient(135deg,#166534,#16a34a)',
      body,
    }),
  };
}

/**
 * Rejection email sent to applicant.
 */
function buildRejectionEmail(app: Record<string, string>, reason: string): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Dear <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      Thank you for your interest in joining the Malayalee Engineers' Association of North Texas (MEANT).
    </p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      After careful review, the Board of Directors was unable to approve your membership application at this time.
    </p>
    ${reason ? `
      ${highlightBox(`
        <h3 style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px;">Reason</h3>
        <p style="font-size:14px;color:#78716c;margin:0;">${reason}</p>
      `, 'amber')}
    ` : ''}
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">
      If you have any questions or would like more information, please contact us.
    </p>
  `;

  return {
    subject: 'MEANT Membership Application Update',
    html: emailLayout({
      headerTitle: 'Application Update',
      headerSubtitle: "Malayalee Engineers' Association of North Texas",
      body,
    }),
  };
}

// ========================================
// Helper: Send to member + spouse
// ========================================

function getRecipients(primaryEmail: string, app: Record<string, string>): string[] {
  const emails = [primaryEmail];
  const spouseEmail = getSpouseEmail(app);
  if (spouseEmail && spouseEmail !== primaryEmail) {
    emails.push(spouseEmail);
  }
  return emails;
}

// ========================================
// Service
// ========================================

export async function isBoDMember(email: string): Promise<boolean> {
  const officers = await orgOfficerRepository.findAll({ status: 'Active' });
  return officers.some((o) => o.group === 'BoD' && o.email.toLowerCase() === email.toLowerCase());
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

    // Fire-and-forget: send confirmation email to applicant + spouse
    const { subject: confirmSubject, html: confirmHtml } = buildConfirmationEmail(record);
    const applicantRecipients = getRecipients(email, record);
    sendEmail(applicantRecipients, confirmSubject, confirmHtml, 'system').catch((err) =>
      console.error('Failed to send applicant confirmation:', err),
    );

    // Fire-and-forget: notify all BoD members
    getBoDEmails().then(async (bodMembers) => {
      if (bodMembers.length === 0) return;
      const { subject, html } = buildBoDNotificationEmail(record);
      const emails = bodMembers.map((b) => b.email);
      await sendEmail(emails, subject, html, 'system').catch((err) =>
        console.error('Failed to send BoD notification:', err),
      );
    });

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
    // Only BoD members can approve
    await requireBoDMember(approverEmail);

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
      const today = now.split('T')[0];

      // BoD approval serves as payment verification - mark Zelle payments as Paid
      if (app.paymentMethod === 'zelle' && app.paymentStatus !== 'Paid') {
        updateData.paymentStatus = 'Paid';
      }

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
        membershipType: parseMembershipPlan(app.membershipType).membershipType,
        membershipLevel: parseMembershipPlan(app.membershipType).membershipLevel,
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

      // Record membership income
      const amountPaid = parseFloat(app.amountPaid || '0');
      if (amountPaid > 0) {
        await incomeRepository.create({
          id: generateId(),
          incomeType: 'Membership',
          eventName: '',
          amount: amountPaid,
          date: today,
          paymentMethod: app.paymentMethod || '',
          payerName: `${app.firstName} ${app.lastName}`.trim(),
          notes: `New membership (${app.membershipType})`,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Send welcome email to member + spouse
      const socialLinks = await getSocialLinks();
      const { subject: welcomeSubject, html: welcomeHtml } = buildWelcomeEmail(app, socialLinks);
      const memberRecipients = getRecipients(app.email, app);
      sendEmail(memberRecipients, welcomeSubject, welcomeHtml, 'system').catch((err) =>
        console.error('Failed to send welcome email:', err),
      );

      // Send approval notification to BoD
      getBoDEmails().then(async (bodMembers) => {
        if (bodMembers.length === 0) return;
        const { subject, html } = buildBoDApprovalNotificationEmail(app, approverName, approvalCount, requiredApprovals);
        const emails = bodMembers.map((b) => b.email);
        await sendEmail(emails, subject, html, 'system').catch((err) =>
          console.error('Failed to send BoD approval notification:', err),
        );
      });
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
    // Only BoD members can reject
    await requireBoDMember(rejectorEmail);

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

    // Send rejection email to applicant + spouse
    const { subject, html } = buildRejectionEmail(app, reason);
    const recipients = getRecipients(app.email, app);
    sendEmail(recipients, subject, html, 'system').catch((err) =>
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
