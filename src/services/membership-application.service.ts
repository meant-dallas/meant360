import { membershipApplicationRepository, committeeRepository, settingRepository } from '@/repositories';
import { memberService } from './members.service';
import { sendEmail } from './email.service';
import { logActivity } from '@/lib/audit-log';
import { getAppUrl } from '@/lib/app-url';

const DEFAULT_REQUIRED_APPROVALS = 3;

const WHATSAPP_GROUPS = [
  { name: 'MEANT Community Group 1', url: 'https://chat.whatsapp.com/BsetghMXame7JgBwPoOX9j' },
  { name: 'MEANT Community Group 2', url: 'https://chat.whatsapp.com/EV6WDukWhB3CGU4aq7OtcM' },
];

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
  const appUrl = getAppUrl();
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
        <a href="${appUrl}/membership-applications" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
          Review Applications
        </a>
      </p>
    `,
  };
}

function buildWelcomeEmail(
  app: Record<string, string>,
  socialLinks: { instagram: string; facebook: string; linkedin: string; youtube: string },
): { subject: string; html: string } {
  const name = `${app.firstName} ${app.lastName}`.trim();

  // Parse nested JSON fields safely
  const address = (() => { try { return JSON.parse(app.address || '{}'); } catch { return {}; } })();
  const spouse = (() => { try { return JSON.parse(app.spouse || '{}'); } catch { return {}; } })();
  const children: Array<{ name: string; age?: string; sex?: string; grade?: string }> =
    (() => { try { return JSON.parse(app.children || '[]'); } catch { return []; } })();

  const addressStr = [address.street, address.street2, address.city, address.state, address.zipCode, address.country]
    .filter(Boolean).join(', ');
  const spouseName = [spouse.firstName, spouse.middleName, spouse.lastName].filter(Boolean).join(' ');

  // QR code URLs via public API
  const qrUrl = (link: string) => `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(link)}`;

  // Styles
  const sectionTitle = 'font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:8px;border-bottom:2px solid #2563eb;margin-bottom:12px;';
  const tableStyle = 'width:100%;border-collapse:collapse;';
  const thStyle = 'text-align:left;padding:8px 12px;color:#64748b;font-size:13px;font-weight:600;width:40%;vertical-align:top;';
  const tdStyle = 'padding:8px 12px;color:#1e293b;font-size:13px;vertical-align:top;';
  const rowEven = 'background-color:#f8fafc;';
  const cardStyle = 'background:#ffffff;border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #e2e8f0;';
  const qrCard = 'display:inline-block;text-align:center;margin:8px;padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;vertical-align:top;';

  // Build member details table rows
  const detailRows = [
    ['Name', `${app.firstName} ${app.middleName || ''} ${app.lastName}`.replace(/\s+/g, ' ').trim()],
    ['Email', app.email],
    ['Phone', app.phone || app.cellPhone || app.homePhone || '-'],
    app.cellPhone ? ['Cell Phone', app.cellPhone] : null,
    app.homePhone ? ['Home Phone', app.homePhone] : null,
    ['Qualifying Degree', app.qualifyingDegree || '-'],
    ['College', app.college || '-'],
    ['Job Title', app.jobTitle || '-'],
    ['Employer', app.employer || '-'],
    app.nativePlace ? ['Native Place', app.nativePlace] : null,
    app.specialInterests ? ['Special Interests', app.specialInterests] : null,
    addressStr ? ['Address', addressStr] : null,
  ].filter(Boolean) as [string, string][];

  const detailTableHtml = detailRows.map(([label, value], i) =>
    `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${thStyle}">${label}</td><td style="${tdStyle}">${value}</td></tr>`
  ).join('');

  // Spouse rows
  let spouseHtml = '';
  if (spouseName) {
    const spouseRows = [
      ['Name', spouseName],
      spouse.email ? ['Email', spouse.email] : null,
      spouse.phone ? ['Phone', spouse.phone] : null,
      spouse.company ? ['Company', spouse.company] : null,
      spouse.college ? ['College', spouse.college] : null,
      spouse.qualifyingDegree ? ['Qualifying Degree', spouse.qualifyingDegree] : null,
      spouse.nativePlace ? ['Native Place', spouse.nativePlace] : null,
    ].filter(Boolean) as [string, string][];

    spouseHtml = `
      <div style="${cardStyle}">
        <h3 style="${sectionTitle}">Spouse Information</h3>
        <table style="${tableStyle}">
          ${spouseRows.map(([label, value], i) =>
            `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${thStyle}">${label}</td><td style="${tdStyle}">${value}</td></tr>`
          ).join('')}
        </table>
      </div>`;
  }

  // Children rows
  let childrenHtml = '';
  const validChildren = children.filter(c => c.name?.trim());
  if (validChildren.length > 0) {
    childrenHtml = `
      <div style="${cardStyle}">
        <h3 style="${sectionTitle}">Children</h3>
        <table style="${tableStyle}">
          <tr style="background-color:#f1f5f9;">
            <td style="${thStyle}">Name</td>
            <td style="${thStyle}">Age</td>
            <td style="${thStyle}">Sex</td>
            <td style="${thStyle}">Grade</td>
          </tr>
          ${validChildren.map((c, i) =>
            `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${tdStyle}">${c.name}</td><td style="${tdStyle}">${c.age || '-'}</td><td style="${tdStyle}">${c.sex || '-'}</td><td style="${tdStyle}">${c.grade || '-'}</td></tr>`
          ).join('')}
        </table>
      </div>`;
  }

  // Sponsor info
  let sponsorHtml = '';
  if (app.sponsorName) {
    sponsorHtml = `
      <div style="${cardStyle}">
        <h3 style="${sectionTitle}">Sponsoring Member</h3>
        <table style="${tableStyle}">
          <tr style="${rowEven}"><td style="${thStyle}">Name</td><td style="${tdStyle}">${app.sponsorName}</td></tr>
          <tr><td style="${thStyle}">Email</td><td style="${tdStyle}">${app.sponsorEmail || '-'}</td></tr>
          <tr style="${rowEven}"><td style="${thStyle}">Phone</td><td style="${tdStyle}">${app.sponsorPhone || '-'}</td></tr>
        </table>
      </div>`;
  }

  // Social media section
  const socialItems: { name: string; url: string; color: string; icon: string }[] = [];
  if (socialLinks.facebook) socialItems.push({ name: 'Facebook', url: socialLinks.facebook, color: '#1877F2', icon: '📘' });
  if (socialLinks.instagram) socialItems.push({ name: 'Instagram', url: socialLinks.instagram, color: '#E4405F', icon: '📸' });
  if (socialLinks.linkedin) socialItems.push({ name: 'LinkedIn', url: socialLinks.linkedin, color: '#0A66C2', icon: '💼' });
  if (socialLinks.youtube) socialItems.push({ name: 'YouTube', url: socialLinks.youtube, color: '#FF0000', icon: '🎬' });

  const socialQrHtml = socialItems.map(s =>
    `<div style="${qrCard}">
      <img src="${qrUrl(s.url)}" alt="${s.name} QR" width="140" height="140" style="border-radius:8px;display:block;margin:0 auto 8px;" />
      <p style="margin:0;font-size:13px;font-weight:700;color:${s.color};">${s.icon} ${s.name}</p>
      <a href="${s.url}" style="font-size:11px;color:#2563eb;word-break:break-all;">${s.url}</a>
    </div>`
  ).join('');

  const whatsappQrHtml = WHATSAPP_GROUPS.map((g, i) =>
    `<div style="${qrCard}">
      <img src="${qrUrl(g.url)}" alt="WhatsApp QR ${i + 1}" width="140" height="140" style="border-radius:8px;display:block;margin:0 auto 8px;" />
      <p style="margin:0;font-size:13px;font-weight:700;color:#25D366;">💬 ${g.name}</p>
      <a href="${g.url}" style="font-size:11px;color:#2563eb;word-break:break-all;">${g.url}</a>
    </div>`
  ).join('');

  return {
    subject: 'Congratulations! Welcome to MEANT!',
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background-color:#f1f5f9;padding:20px;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1e40af,#2563eb);border-radius:14px 14px 0 0;padding:32px 24px;text-align:center;">
          <img src="${getAppUrl()}/logo.png" alt="MEANT" width="64" height="64" style="border-radius:12px;margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px;">Welcome to MEANT!</h1>
          <p style="color:#bfdbfe;font-size:14px;margin:0;">Malayalee Engineers' Association of North Texas</p>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:32px 24px;">
          <!-- Greeting -->
          <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Hello <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 8px;">
            Thank you for your interest in joining <strong>MEANT Inc.</strong> and we would like to inform you that your Membership Application has been approved.
          </p>
          <p style="font-size:20px;text-align:center;margin:16px 0;color:#16a34a;font-weight:700;">
            🎉 Congratulations!!! 🎉
          </p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 24px;">
            Welcome to MEANT. We are excited to have you!
          </p>

          <!-- Membership Info -->
          <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #93c5fd;">
            <h3 style="font-size:14px;font-weight:700;color:#1e40af;margin:0 0 8px;">Membership Details</h3>
            <table style="${tableStyle}">
              <tr><td style="padding:4px 8px;color:#64748b;font-size:13px;">Membership Type</td><td style="padding:4px 8px;font-size:13px;font-weight:600;color:#1e293b;">${app.membershipType || 'Standard'}</td></tr>
              ${app.amountPaid && app.amountPaid !== '0' ? `<tr><td style="padding:4px 8px;color:#64748b;font-size:13px;">Amount Paid</td><td style="padding:4px 8px;font-size:13px;font-weight:600;color:#1e293b;">$${app.amountPaid}</td></tr>` : ''}
              ${app.paymentStatus ? `<tr><td style="padding:4px 8px;color:#64748b;font-size:13px;">Payment Status</td><td style="padding:4px 8px;font-size:13px;font-weight:600;color:#16a34a;">${app.paymentStatus}</td></tr>` : ''}
            </table>
          </div>

          <!-- Application Details -->
          <div style="${cardStyle}">
            <h3 style="${sectionTitle}">Your Application Details</h3>
            <table style="${tableStyle}">
              ${detailTableHtml}
            </table>
          </div>

          ${spouseHtml}
          ${childrenHtml}
          ${sponsorHtml}

          <!-- WhatsApp Community -->
          <div style="${cardStyle}">
            <h3 style="${sectionTitle}">📱 Join Our WhatsApp Community</h3>
            <p style="font-size:13px;color:#475569;margin:0 0 16px;">
              Please join the MEANT WhatsApp Community for event announcements and updates:
            </p>
            <div style="text-align:center;">
              ${whatsappQrHtml}
            </div>
          </div>

          <!-- Social Media -->
          ${socialItems.length > 0 ? `
          <div style="${cardStyle}">
            <h3 style="${sectionTitle}">🌐 Follow Us on Social Media</h3>
            <p style="font-size:13px;color:#475569;margin:0 0 16px;">
              Stay connected with MEANT on social media:
            </p>
            <div style="text-align:center;">
              ${socialQrHtml}
            </div>
          </div>` : ''}

          <!-- Footer -->
          <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;">
            <p style="font-size:13px;color:#64748b;margin:0 0 4px;">We look forward to seeing you at our upcoming events!</p>
            <p style="font-size:12px;color:#94a3b8;margin:0;">
              &copy; ${new Date().getFullYear()} MEANT (Malayalee Engineers' Association of North Texas)
            </p>
          </div>
        </div>
      </div>
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

      // Send welcome email with social links from settings
      const settings = await settingRepository.getAll();
      const socialLinks = {
        instagram: settings['social_instagram'] || '',
        facebook: settings['social_facebook'] || '',
        linkedin: settings['social_linkedin'] || '',
        youtube: settings['social_youtube'] || '',
      };
      const { subject, html } = buildWelcomeEmail(app, socialLinks);
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
