import { generateId, todayCST, parseLocalDate } from '@/lib/utils';
import { recordAttendance } from './engagement.service';
import { createCrudService, NotFoundError } from './crud.service';
import { parseGuestPolicy, parseActivityMaxSlots, parseActivities, parseActivityPricingMode, parseActivityMode, parseActivityRegistrations, resolveRegistrationFeatures } from '@/lib/event-config';
import { parsePricingRules, calculatePrice, calculateActivityPrice, deriveKidsSplitFromAttendeeNames } from '@/lib/pricing';
import { refundRegistrationPayment, notifyTreasurer } from './refunds.service';
import { buildRegistrationLifecycleEmail, type EmailLedgerEntry } from '@/lib/registration-emails';
import {
  eventRepository,
  eventParticipantRepository,
  memberRepository,
  memberAddressRepository,
  memberSpouseRepository,
  memberChildRepository,
  guestRepository,
  incomeRepository,
  expenseRepository,
  settingRepository,
  membershipApplicationRepository,
  registrationLedgerRepository,
} from '@/repositories';
import { sendEmail } from './email.service';
import { deleteEventPaymentConfig } from './settings.service';
import { getPublicSponsors } from './sponsors.service';
import * as Sentry from '@sentry/nextjs';
import {
  emailLayout,
  highlightBox,
  detailsTable,
  sectionCard,
  whatsappSection,
  socialMediaSection,
  actionButton,
  portalSection,
  sponsorsSection,
} from '@/lib/email-templates';
import type { PublicSponsor } from '@/types';

/**
 * Parse a membership plan name (e.g. "Family Membership") into the
 * membershipType (billing cycle) and membershipLevel (tier) fields.
 */
export function parseMembershipPlan(planName: string): { membershipType: string; membershipLevel: string } {
  if (!planName) return { membershipType: 'Yearly', membershipLevel: '' };
  const lower = planName.toLowerCase();
  if (lower.includes('life')) return { membershipType: 'Life Member', membershipLevel: 'Family' };
  if (lower.includes('individual')) return { membershipType: 'Yearly', membershipLevel: 'Individual' };
  if (lower.includes('student')) return { membershipType: 'Yearly', membershipLevel: 'Student' };
  if (lower.includes('family')) return { membershipType: 'Yearly', membershipLevel: 'Family' };
  // Fallback: keep as-is if it's already a valid type value
  if (planName === 'Yearly' || planName === 'Life Member') return { membershipType: planName, membershipLevel: '' };
  return { membershipType: 'Yearly', membershipLevel: '' };
}

/**
 * Look up the contact email for an event category from settings.
 */
async function getCategoryEmail(category: string): Promise<string | null> {
  if (!category) return null;
  try {
    const settings = await settingRepository.getAll();
    const raw = settings['email_categories'] || '[]';
    const cats: { name: string; email: string }[] = JSON.parse(raw);
    const match = cats.find(
      (c) => c.name.toLowerCase().trim() === category.toLowerCase().trim(),
    );
    return match?.email || null;
  } catch {
    return null;
  }
}

import { getAppUrl } from '@/lib/app-url';

/**
 * Resolve the category logo URL from settings for a given event category.
 */
async function getCategoryLogoUrl(category: string): Promise<string> {
  if (!category) return '';
  try {
    const settings = await settingRepository.getAll();
    const cats: { name: string; email: string; logoUrl?: string }[] = JSON.parse(settings['email_categories'] || '[]');
    const match = cats.find(
      (c) => c.name.toLowerCase().trim() === category.toLowerCase().trim(),
    );
    return match?.logoUrl || '';
  } catch {
    return '';
  }
}

/**
 * Convert basic markdown-like formatting to email-safe HTML.
 * Supports **bold**, *italic*, [text](url), and line breaks.
 */
function formatCustomMessage(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>');
  // Line breaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function buildEventEmailHtml(opts: {
  type: 'registration' | 'checkin';
  participantName: string;
  eventName: string;
  eventDate: string;
  eventId?: string;
  eventDescription?: string;
  eventCategory?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice?: string;
  paymentMethod?: string;
  participantType?: string;
  registrationStatus?: string;
  customEmailMessage?: string;
  eventSponsors?: PublicSponsor[];
  generalSponsors?: PublicSponsor[];
}): string {
  const isRegistration = opts.type === 'registration';
  const isWaitlist = opts.registrationStatus === 'waitlist';
  const title = isRegistration
    ? (isWaitlist ? 'Added to Waitlist' : 'Registration Confirmed!')
    : 'Check-in Confirmed!';
  const subtitle = isRegistration
    ? (isWaitlist
      ? `You have been added to the <strong>waitlist</strong> for <strong>${opts.eventName}</strong>. We will notify you if a spot becomes available.`
      : `You are registered for <strong>${opts.eventName}</strong>. Please remember to check in when you arrive on the day of the event.`)
    : `You have been successfully checked in to <strong>${opts.eventName}</strong>. Enjoy the event!`;
  const headerGradient = isRegistration
    ? 'linear-gradient(135deg,#1e40af,#2563eb)'
    : 'linear-gradient(135deg,#059669,#10b981)';
  const accentColor = isRegistration ? '#2563eb' : '#10b981';
  const accentLight = isRegistration ? '#eff6ff' : '#ecfdf5';
  const accentBorder = isRegistration ? '#93c5fd' : '#6ee7b7';

  const appUrl = getAppUrl();
  const logoSrc = opts.logoUrl || `${appUrl}/logo.png`;
  const eventHomeUrl = opts.eventId ? `${appUrl}/events/${opts.eventId}/home` : '';

  // Format date nicely. Dates are stored as YYYY-MM-DD strings; parsing them
  // directly with new Date() treats them as UTC midnight, which shifts to the
  // previous day in US timezones. Appending T12:00:00Z (noon UTC) keeps the
  // correct calendar date in any timezone.
  let formattedDate = opts.eventDate || 'TBD';
  try {
    if (opts.eventDate) {
      const d = parseLocalDate(opts.eventDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
        });
      }
    }
  } catch { /* keep raw */ }

  const thStyle = 'text-align:left;padding:10px 14px;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;border-bottom:1px solid #f1f5f9;';
  const tdStyle = 'padding:10px 14px;color:#1e293b;font-size:13px;font-weight:500;vertical-align:top;border-bottom:1px solid #f1f5f9;';
  const rowEven = 'background-color:#f8fafc;';

  // Build detail rows
  const rows: [string, string][] = [
    ['Event', `<strong>${opts.eventName}</strong>`],
    ['Date', formattedDate],
  ];
  if (opts.eventCategory) rows.push(['Category', opts.eventCategory]);
  if (opts.participantType) rows.push(['Type', opts.participantType === 'Member' ? '🟢 Member' : '🔵 Guest']);
  if (isWaitlist) rows.push(['Status', '<span style="color:#b45309;font-weight:600;">⏳ Waitlisted</span>']);
  if (opts.adults > 0) rows.push(['Adults', String(opts.adults)]);
  if (opts.kids > 0) rows.push(['Kids', String(opts.kids)]);
  if (isRegistration && opts.totalPrice && opts.totalPrice !== '0') {
    rows.push(['Amount', `<strong>$${opts.totalPrice}</strong>`]);
  }
  if (opts.paymentMethod) rows.push(['Payment', opts.paymentMethod]);

  const detailRowsHtml = rows.map(([label, value], i) =>
    `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${thStyle}">${label}</td><td style="${tdStyle}">${value}</td></tr>`
  ).join('');

  return `
    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#f1f5f9;padding:24px 16px;">

      <!-- Header card -->
      <div style="background:${headerGradient};border-radius:16px 16px 0 0;padding:36px 28px 28px;text-align:center;">
        <img src="${logoSrc}" alt="MEANT" width="68" height="68" style="border-radius:14px;margin-bottom:16px;border:3px solid rgba(255,255,255,0.35);display:block;margin-left:auto;margin-right:auto;" />
        <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 6px;letter-spacing:-0.3px;">${opts.eventName}</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">${formattedDate}</p>
      </div>

      <!-- Confirmation badge strip -->
      <div style="background:${accentLight};border-left:4px solid ${accentColor};border-right:4px solid ${accentColor};padding:14px 24px;text-align:center;">
        <span style="font-size:15px;font-weight:700;color:${accentColor};">
          ${isRegistration ? (isWaitlist ? '⏳ On Waitlist' : '🎫 Registration Confirmed') : '✅ Checked In'}
        </span>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px 28px 32px;border:1px solid #e2e8f0;border-top:none;">

        <!-- Greeting -->
        <p style="font-size:15px;color:#1e293b;margin:0 0 6px;font-weight:600;">Hi ${opts.participantName},</p>
        <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 24px;">${subtitle}</p>

        ${opts.eventDescription ? `
        <!-- Event Description -->
        <div style="background:#f8fafc;border-radius:10px;padding:14px 18px;margin-bottom:24px;border:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.6px;">About this Event</p>
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${opts.eventDescription}</p>
        </div>
        ` : ''}

        <!-- Registration Details Card -->
        <div style="border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:24px;">
          <div style="background:${accentLight};padding:10px 16px;border-bottom:1px solid ${accentBorder};">
            <p style="margin:0;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.6px;">
              ${isRegistration ? '📋 Registration Details' : '📋 Check-in Details'}
            </p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${detailRowsHtml}
          </table>
        </div>

        ${opts.customEmailMessage ? `
        <!-- Custom Message -->
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.6px;">📌 Important Information</p>
          <div style="font-size:13px;color:#78350f;line-height:1.65;">
            ${formatCustomMessage(opts.customEmailMessage)}
          </div>
        </div>
        ` : ''}

        ${sponsorsSection(opts.eventSponsors || [], opts.generalSponsors || [])}

        ${isRegistration && !isWaitlist && eventHomeUrl ? `
        <!-- Check-in CTA -->
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #86efac;border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#166534;">📍 Remember to Check In on Event Day</p>
          <p style="margin:0 0 16px;font-size:13px;color:#166534;line-height:1.5;">
            When you arrive, please check in using the button on the event page. It only takes a second and helps us track attendance.
          </p>
          <a href="${eventHomeUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.2px;">
            Check In on Event Day →
          </a>
          <p style="margin:10px 0 0;font-size:11px;color:#4ade80;">
            Or visit: <a href="${eventHomeUrl}" style="color:#166534;text-decoration:underline;">${eventHomeUrl}</a>
          </p>
        </div>
        ` : ''}

        ${isWaitlist ? `
        <!-- Waitlist notice -->
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;">⏳ You're on the Waitlist</p>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
            This event has reached capacity. We'll notify you right away if a spot opens up.
          </p>
        </div>
        ` : ''}

        ${!isRegistration && eventHomeUrl ? `
        <!-- Event home link for check-in email -->
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${eventHomeUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 28px;border-radius:8px;">
            View Event Page
          </a>
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="text-align:center;padding-top:20px;border-top:1px solid #f1f5f9;">
          <p style="font-size:12px;color:#94a3b8;margin:0 0 4px;">
            ${isRegistration && !isWaitlist ? 'See you at the event!' : isWaitlist ? "We'll keep you posted." : 'Thank you for attending!'}
          </p>
          <p style="font-size:11px;color:#cbd5e1;margin:0;">
            &copy; ${new Date().getFullYear()} MEANT &mdash; Malayalee Engineers&rsquo; Association of North Texas
          </p>
        </div>
      </div>
    </div>
  `;
}

function buildCheckinConfirmationEmail(opts: {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventId?: string;
  eventDescription?: string;
  eventCategory?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice?: string;
  paymentMethod?: string;
  participantType?: string;
  customEmailMessage?: string;
  eventSponsors?: PublicSponsor[];
  generalSponsors?: PublicSponsor[];
}): string {
  return buildEventEmailHtml({ ...opts, type: 'checkin' });
}

function buildCategoryAlertEmail(opts: {
  participantName: string;
  participantEmail: string;
  participantType: string;
  eventName: string;
  eventDate?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice: string;
  paymentMethod?: string;
}): string {
  const logoSrc = opts.logoUrl || `${getAppUrl()}/logo.png`;
  let formattedDate = opts.eventDate || '';
  try {
    if (opts.eventDate) {
      const d = parseLocalDate(opts.eventDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
      }
    }
  } catch { /* keep raw */ }

  const thStyle = 'text-align:left;padding:8px 12px;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;';
  const tdStyle = 'padding:8px 12px;color:#1e293b;font-size:13px;vertical-align:top;';
  const rowEven = 'background-color:#f8fafc;';

  const rows: [string, string][] = [
    ['Name', opts.participantName],
    ['Email', opts.participantEmail],
    ['Type', opts.participantType === 'Member' ? '🟢 Member' : '🔵 Guest'],
    ['Adults', String(opts.adults)],
    ['Kids', String(opts.kids)],
  ];
  if (opts.totalPrice && opts.totalPrice !== '0') rows.push(['Amount', `$${opts.totalPrice}`]);
  if (opts.paymentMethod) rows.push(['Payment', opts.paymentMethod]);

  const rowsHtml = rows.map(([label, value], i) =>
    `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${thStyle}">${label}</td><td style="${tdStyle}">${value}</td></tr>`
  ).join('');

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background-color:#f1f5f9;padding:16px;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1e40af,#2563eb);border-radius:12px 12px 0 0;padding:20px;text-align:center;">
        <img src="${logoSrc}" alt="${opts.eventName}" width="48" height="48" style="border-radius:10px;border:2px solid rgba(255,255,255,0.3);margin-bottom:8px;" />
        <h2 style="color:#ffffff;font-size:18px;margin:0;">New Registration</h2>
        <p style="color:#bfdbfe;font-size:13px;margin:4px 0 0;">${opts.eventName}${formattedDate ? ` — ${formattedDate}` : ''}</p>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:20px;">
        <p style="font-size:14px;color:#475569;margin:0 0 16px;">
          <strong>${opts.participantName}</strong> has registered for this event.
        </p>

        <!-- Details -->
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          ${rowsHtml}
        </table>

        <!-- Footer -->
        <p style="font-size:11px;color:#94a3b8;margin:16px 0 0;text-align:center;">
          &copy; ${new Date().getFullYear()} MEANT (Malayalee Engineers' Association of North Texas)
        </p>
      </div>
    </div>
  `;
}

/**
 * Create an income record when a registration/check-in has a payment.
 */
async function createIncomeFromPayment(opts: {
  eventName: string;
  amount: string;
  payerName: string;
  paymentMethod: string;
  source: 'registration' | 'checkin';
}) {
  const total = parseFloat(opts.amount || '0');
  if (total <= 0) return;

  const now = new Date().toISOString();
  await incomeRepository.create({
    id: generateId(),
    incomeType: 'Event',
    eventName: opts.eventName,
    amount: total,
    date: now.split('T')[0],
    paymentMethod: opts.paymentMethod || '',
    payerName: opts.payerName,
    notes: `Auto-created from ${opts.source}`,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Renew an expired member's membership during event registration.
 * Creates a Membership income record and updates the member's status.
 */
async function renewMembership(opts: {
  memberId: string;
  amount: string;
  payerName: string;
  paymentMethod: string;
  eventName: string;
  membershipType?: string;
}) {
  const total = parseFloat(opts.amount || '0');
  if (total <= 0) return;

  const isZelle = opts.paymentMethod === 'zelle';
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const currentYear = String(new Date().getFullYear());

  // Update member: status → Active (or On Hold for Zelle), renewalDate, append year, optionally update type
  const memberRecord = await memberRepository.findById(opts.memberId);
  if (memberRecord) {
    const existingYears = (memberRecord.membershipYears || '')
      .split(',').map((y: string) => y.trim()).filter(Boolean);
    if (!existingYears.includes(currentYear)) existingYears.push(currentYear);
    const updates: Record<string, unknown> = {
      ...memberRecord,
      status: isZelle ? 'On Hold' : 'Active',
      renewalDate: today,
      membershipYears: existingYears.join(','),
      updatedAt: now,
    };
    if (opts.membershipType) {
      const { membershipType, membershipLevel } = parseMembershipPlan(opts.membershipType);
      updates.membershipType = membershipType;
      if (membershipLevel) updates.membershipLevel = membershipLevel;
    }
    await memberRepository.update(opts.memberId, updates);
  }

  // Create Membership income record
  await incomeRepository.create({
    id: generateId(),
    incomeType: 'Membership',
    eventName: opts.eventName,
    amount: total,
    date: today,
    paymentMethod: opts.paymentMethod || '',
    payerName: opts.payerName,
    notes: `Membership renewal${opts.membershipType ? ` (${opts.membershipType})` : ''}${isZelle ? ' — pending Zelle verification' : ''}`,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Standalone membership renewal — does NOT create an event_participant record.
 * Used when an expired member renews during event registration without registering for the event.
 */
export async function renewMembershipOnly(data: {
  memberId: string;
  membershipType: string;
  amount: string;
  payerName: string;
  payerEmail: string;
  paymentMethod: string;
  transactionId: string;
  eventName: string;
}) {
  const member = await memberRepository.findById(data.memberId);
  if (!member) throw new Error('Member not found');

  await renewMembership({
    memberId: data.memberId,
    amount: data.amount,
    payerName: data.payerName,
    paymentMethod: data.paymentMethod,
    eventName: data.eventName,
    membershipType: data.membershipType,
  });

  // Send renewal confirmation email to member + spouse
  try {
    const { subject, html, recipients } = await buildRenewalConfirmationEmail(member, data);
    await sendEmail(recipients, subject, html, 'system');
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Failed to send renewal confirmation' } });
  }

  return { success: true, memberId: data.memberId, membershipType: data.membershipType };
}

async function buildRenewalConfirmationEmail(
  member: Record<string, string>,
  data: { membershipType: string; amount: string; payerName: string; payerEmail: string; paymentMethod: string; transactionId: string },
): Promise<{ subject: string; html: string; recipients: string[] }> {
  const name = data.payerName || `${member.firstName} ${member.lastName}`.trim();
  const currentYear = new Date().getFullYear();
  const today = todayCST();

  const settings = await settingRepository.getAll();
  const socialLinks = {
    instagram: settings['social_instagram'] || '',
    facebook: settings['social_facebook'] || '',
    linkedin: settings['social_linkedin'] || '',
    youtube: settings['social_youtube'] || '',
  };

  const body = `
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Dear <strong>${name}</strong>,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      Your membership with the <strong>Malayalee Engineers' Association of North Texas (MEANT)</strong> has been successfully renewed.
      Thank you for your continued support!
    </p>

    ${highlightBox(`
      <p style="font-size:22px;text-align:center;margin:0;color:#16a34a;font-weight:700;">
        Membership Renewed!
      </p>
      <p style="font-size:14px;text-align:center;color:#166534;margin:8px 0 0;">
        Your membership is now active for ${currentYear}.
      </p>
    `, 'green')}

    ${sectionCard('Renewal Details', detailsTable([
    ['Member Name', name],
    ['Email', data.payerEmail],
    ['Membership Type', data.membershipType],
    ['Amount Paid', `$${data.amount}`],
    data.paymentMethod ? ['Payment Method', data.paymentMethod] : null,
    data.transactionId ? ['Transaction ID', data.transactionId] : null,
    ['Renewal Date', today],
    ['Valid Through', `December 31, ${currentYear}`],
  ]))}

    ${sectionCard('Member Information', detailsTable([
    ['Name', `${member.firstName} ${member.middleName || ''} ${member.lastName}`.replace(/\s+/g, ' ').trim()],
    ['Email', member.email],
    ['Phone', member.phone || member.cellPhone || '-'],
    member.employer ? ['Employer', member.employer] : null,
    member.membershipType ? ['Membership Category', member.membershipType] : null,
  ]))}

    ${portalSection()}

    ${whatsappSection()}
    ${socialMediaSection(socialLinks)}
  `;

  // Build recipient list: member + spouse
  const recipients = [data.payerEmail];
  if (member.spouseEmail && member.spouseEmail !== data.payerEmail) {
    recipients.push(member.spouseEmail);
  }

  return {
    subject: `Membership Renewed - MEANT ${currentYear}`,
    html: emailLayout({
      headerTitle: 'Membership Renewed!',
      headerSubtitle: "Malayalee Engineers' Association of North Texas",
      headerColor: 'linear-gradient(135deg,#166534,#16a34a)',
      body,
    }),
    recipients,
  };
}

// ========================================
// Event Services
// ========================================

export const eventService = createCrudService({
  repository: eventRepository,
  entityName: 'Event',
  getEntityLabel: (r) => String(r.name || r.id),
  buildCreateRecord: (data) => ({
    name: String(data.name || ''),
    date: String(data.date || ''),
    description: String(data.description || ''),
    status: String(data.status || 'Upcoming'),
    parentEventId: '',
    pricingRules: String(data.pricingRules || ''),
    formConfig: String(data.formConfig || ''),
    activities: String(data.activities || ''),
    activityPricingMode: String(data.activityPricingMode || ''),
    guestPolicy: String(data.guestPolicy || ''),
    registrationOpen: String(data.registrationOpen || '').toLowerCase() === 'true' ? 'true' : '',
    capacity: parseInt(String(data.capacity || '0'), 10) || 0,
    capacityMode: (() => {
      const v = String(data.capacityMode || '');
      const valid = new Set(['per_registration', 'per_adult', 'per_kid', 'per_adult,per_kid', 'per_kid,per_adult']);
      return valid.has(v) ? v : 'per_registration';
    })(),
    showOnPortal: String(data.showOnPortal || '').toLowerCase() === 'false' ? '' : 'true',
    customEmailMessage: String(data.customEmailMessage || ''),
    selfServiceEditEnabled: String(data.selfServiceEditEnabled || '').toLowerCase() === 'true' ? 'true' : 'false',
    cancelRefundEnabled: String(data.cancelRefundEnabled || '').toLowerCase() === 'true' ? 'true' : 'false',
  }),
  onBeforeDelete: async (record) => {
    await deleteEventPaymentConfig(String(record.id));
  },
});

/**
 * Notify every active registrant that the whole event has been cancelled.
 * Scope is notification only — this does not change registrationStatus or
 * attempt any refund. Paid registrants are told a refund will be handled
 * manually, and the treasurer is alerted for each so nothing gets missed.
 */
export async function notifyParticipantsOfEventCancellation(eventId: string): Promise<void> {
  const event = await eventRepository.findById(eventId);
  if (!event) return;

  const participants = await eventParticipantRepository.findByEventId(eventId);
  const active = participants.filter((p) => p.registeredAt && p.registrationStatus !== 'cancelled');

  Sentry.addBreadcrumb({
    category: 'event-cancelled',
    message: 'Notifying registrants of event cancellation',
    level: 'info',
    data: { eventId, eventName: event.name, participantCount: active.length },
  });

  for (const p of active) {
    const isPaid = p.paymentStatus === 'paid' && parseFloat(p.totalPrice || '0') > 0;

    try {
      const history = await registrationLedgerRepository.findByParticipantId(p.id) as unknown as EmailLedgerEntry[];
      await sendEmail(
        [p.email],
        `Event Cancelled: ${event.name}`,
        buildRegistrationLifecycleEmail({
          type: 'event_cancelled',
          eventName: event.name,
          eventDate: event.date,
          participantName: p.name,
          adults: parseInt(p.registeredAdults || '0', 10),
          kids: parseInt(p.registeredKids || '0', 10),
          totalPrice: p.totalPrice || '0',
          priceBreakdownJson: p.priceBreakdown || '',
          paymentMethod: p.paymentMethod,
          selectedActivitiesJson: p.selectedActivities,
          activities: parseActivities(event.activities || ''),
          refundStatus: isPaid ? 'manual' : 'none',
          refundNote: isPaid ? 'This event was cancelled — our team will follow up about a refund.' : undefined,
          history,
        }),
        'system',
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Event cancellation email failed', participantId: p.id, eventId } });
    }

    if (isPaid) {
      await notifyTreasurer({
        reason: 'manual_refund_needed',
        eventId,
        eventName: event.name,
        participantId: p.id,
        participantName: p.name,
        participantEmail: p.email,
        amount: p.totalPrice || '0',
        paymentMethod: p.paymentMethod,
        transactionId: p.transactionId,
        errorMessage: 'Event was cancelled by an admin — this paid registration needs a manual refund.',
      });
    }
  }
}

/** Parse a capacityMode string into its constituent parts. */
function parseCapacityModes(mode: string): string[] {
  return mode ? mode.split(',').map((m) => m.trim()).filter(Boolean) : ['per_registration'];
}

/**
 * Count the number of "units" a set of confirmed registrations occupy
 * toward the event capacity, based on the capacity mode.
 *
 * - per_registration: 1 per registration (family-based)
 * - per_adult: sum of adults across all registrations
 * - per_kid: sum of kids across all registrations
 * - per_adult,per_kid: sum of (adults + kids) across all registrations
 */
function countCapacityUsed(
  participants: Record<string, string>[],
  mode: string,
): number {
  const modes = parseCapacityModes(mode);
  const hasAdult = modes.includes('per_adult');
  const hasKid = modes.includes('per_kid');
  if (hasAdult && hasKid) {
    return participants.reduce((sum, p) => sum + safeInt(p.registeredAdults) + safeInt(p.registeredKids), 0);
  }
  if (hasAdult) {
    return participants.reduce((sum, p) => sum + safeInt(p.registeredAdults), 0);
  }
  if (hasKid) {
    return participants.reduce((sum, p) => sum + safeInt(p.registeredKids), 0);
  }
  // per_registration (default)
  return participants.length;
}

/** Safe integer parser for count fields. */
function safeInt(v: string | undefined): number {
  const n = parseInt(v || '0', 10);
  return Number.isFinite(n) && n >= 0 && n <= 999 ? n : 0;
}

/**
 * Count participants using the appropriate mode.
 * - per_registration (family): 1 per row
 * - per_adult: sum of adults only
 * - per_kid: sum of kids only
 * - per_adult,per_kid: sum of adults + kids
 */
function countParticipants(
  rows: Record<string, string>[],
  capMode: string,
  adultsField: string,
  kidsField: string,
): number {
  const modes = parseCapacityModes(capMode);
  const hasAdult = modes.includes('per_adult');
  const hasKid = modes.includes('per_kid');
  if (!hasAdult && !hasKid) return rows.length; // per_registration
  return rows.reduce((sum, p) => {
    const a = hasAdult ? safeInt(p[adultsField]) : 0;
    const k = hasKid ? safeInt(p[kidsField]) : 0;
    return sum + a + k;
  }, 0);
}

/**
 * Compute all event attendance stats from participants, excluding cancelled.
 * Uses capacityMode to determine counting: per_registration (family=1) vs per_person (adults+kids).
 */
function computeEventCounts(allParticipants: Record<string, string>[], capMode: string) {
  const active = allParticipants.filter((p) => p.registrationStatus !== 'cancelled');
  const registered = active.filter((p) => p.registeredAt);
  const confirmedRegistered = registered.filter((p) => p.registrationStatus !== 'waitlist' && p.registrationStatus !== 'on_hold');
  const checkedIn = active.filter((p) => p.checkedInAt);
  const walkIns = active.filter((p) => p.checkedInAt && !p.registeredAt);
  const guests = active.filter((p) => p.type === 'Guest');

  return {
    totalRegistered: countParticipants(registered, capMode, 'registeredAdults', 'registeredKids'),
    confirmedRegistered: countParticipants(confirmedRegistered, capMode, 'registeredAdults', 'registeredKids'),
    totalCheckins: countParticipants(checkedIn, capMode, 'actualAdults', 'actualKids'),
    totalWalkins: countParticipants(walkIns, capMode, 'actualAdults', 'actualKids'),
    // Total guests: for each guest, use check-in count if checked in, else registration count
    totalGuests: parseCapacityModes(capMode).every((m) => m === 'per_registration')
      ? guests.length
      : guests.reduce((sum, p) => {
          if (p.checkedInAt) return sum + safeInt(p.actualAdults) + safeInt(p.actualKids);
          if (p.registeredAt) return sum + safeInt(p.registeredAdults) + safeInt(p.registeredKids);
          return sum;
        }, 0),
    memberRegistered: countParticipants(registered.filter((p) => p.type === 'Member'), capMode, 'registeredAdults', 'registeredKids'),
    guestRegistered: countParticipants(registered.filter((p) => p.type === 'Guest'), capMode, 'registeredAdults', 'registeredKids'),
    memberCheckins: countParticipants(checkedIn.filter((p) => p.type === 'Member'), capMode, 'actualAdults', 'actualKids'),
    guestCheckins: countParticipants(checkedIn.filter((p) => p.type === 'Guest'), capMode, 'actualAdults', 'actualKids'),
  };
}

/**
 * Count how many units a single incoming registration would use toward capacity.
 */
function countRegistrationUnits(
  adults: number,
  kids: number,
  mode: string,
): number {
  const modes = parseCapacityModes(mode);
  const hasAdult = modes.includes('per_adult');
  const hasKid = modes.includes('per_kid');
  if (hasAdult && hasKid) return adults + kids;
  if (hasAdult) return adults;
  if (hasKid) return kids;
  return 1;
}

/**
 * Get public event detail with stats, sub-events, siblings, upcoming events.
 */
export async function getPublicDetail(eventId: string) {
  const existing = await eventRepository.findById(eventId);
  if (!existing) throw new NotFoundError('Event');

  const { id, name, date, description, status, category, pricingRules,
    formConfig, activities, activityPricingMode, guestPolicy, registrationOpen,
    capacity, capacityMode, selfServiceEditEnabled, cancelRefundEnabled } = existing;
  const registrationFeatures = resolveRegistrationFeatures({ selfServiceEditEnabled, cancelRefundEnabled });

  const [participants, allEvents, settings] = await Promise.all([
    eventParticipantRepository.findByEventId(eventId),
    eventRepository.findAll(),
    settingRepository.getAll(),
  ]);

  // Resolve category logo and background color from settings
  let categoryLogoUrl = '';
  let categoryBgColor = '';
  if (category) {
    try {
      const cats: { name: string; email: string; logoUrl?: string; bgColor?: string }[] = JSON.parse(settings['email_categories'] || '[]');
      const match = cats.find(
        (c) => c.name.toLowerCase().trim() === category.toLowerCase().trim(),
      );
      categoryLogoUrl = match?.logoUrl || '';
      categoryBgColor = match?.bgColor || '';
    } catch { /* ignore */ }
  }

  // Build category → logoUrl map from settings
  const categoryLogoMap = new Map<string, string>();
  try {
    const cats: { name: string; email: string; logoUrl?: string }[] = JSON.parse(settings['email_categories'] || '[]');
    for (const c of cats) {
      if (c.logoUrl) categoryLogoMap.set(c.name.toLowerCase().trim(), c.logoUrl);
    }
  } catch { /* ignore */ }

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'Upcoming' && e.id !== id && e.showOnPortal !== 'false')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      categoryLogoUrl: categoryLogoMap.get((e.category || '').toLowerCase().trim()) || '',
    }));

  // Capacity and waitlist info
  const capacityNum = parseInt(String(capacity || '0'), 10) || 0;
  const capMode = capacityMode || 'per_registration';
  const active = participants.filter((p) => p.registrationStatus !== 'cancelled');
  const confirmedRegistrations = active.filter((r) => r.registeredAt && (r.registrationStatus || 'confirmed') === 'confirmed');
  const waitlistRegistrations = active.filter((r) => r.registrationStatus === 'waitlist');
  const confirmedUsed = countCapacityUsed(confirmedRegistrations, capMode);
  const waitlistCount = countParticipants(waitlistRegistrations, capMode, 'registeredAdults', 'registeredKids');
  const spotsRemaining = capacityNum > 0 ? Math.max(0, capacityNum - confirmedUsed) : -1; // -1 means unlimited

  // Compute all counts using shared helper (excludes cancelled, respects capacityMode)
  const counts = computeEventCounts(participants, capMode);

  // Count total unique performance slots (chest numbers) issued, excluding cancelled participants
  const seenSlotIds = new Set<string>();
  for (const p of participants.filter((p) => p.registrationStatus !== 'cancelled')) {
    if (!p.selectedActivities) continue;
    try {
      const acts: Array<{ activityId?: string; slotId?: string }> = JSON.parse(String(p.selectedActivities));
      if (!Array.isArray(acts)) continue;
      const seenInP = new Set<string>();
      for (const a of acts) {
        if (!a.activityId) continue;
        const key = a.slotId || `${p.id}_${a.activityId}`;
        if (!seenInP.has(key)) { seenInP.add(key); seenSlotIds.add(key); }
      }
    } catch { /* ignore */ }
  }
  const totalActivitySlots = seenSlotIds.size;
  const activityMaxSlots = parseActivityMaxSlots(activities || '');

  return {
    id, name, date, description, status,
    category: category || '',
    categoryLogoUrl,
    categoryBgColor,
    pricingRules: pricingRules || '',
    formConfig: formConfig || '',
    activities: activities || '',
    activityPricingMode: activityPricingMode || '',
    guestPolicy: guestPolicy || '',
    registrationOpen: registrationOpen?.toLowerCase() === 'true' ? 'true' : '',
    capacity: capacityNum,
    capacityMode: capMode,
    spotsRemaining,
    waitlistCount,
    totalRegistrations: counts.totalRegistered,
    totalCheckins: counts.totalCheckins,
    totalWalkins: counts.totalWalkins,
    memberCheckinAttendees: counts.memberCheckins,
    guestCheckinAttendees: counts.guestCheckins,
    memberRegAttendees: counts.memberRegistered,
    guestRegAttendees: counts.guestRegistered,
    totalUniqueAttendees: counts.confirmedRegistered, // denominator for check-in progress bar (excludes waitlist/on_hold)
    totalUniqueGuests: counts.totalGuests,
    upcomingEvents,
    activityMaxSlots,
    totalActivitySlots,
    selfServiceEditEnabled: registrationFeatures.selfServiceEditEnabled,
    cancelRefundEnabled: registrationFeatures.cancelRefundEnabled,
  };
}

/**
 * Get event statistics (auth-required).
 */
export async function getStats(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');

  const eventParticipants = await eventParticipantRepository.findByEventId(eventId);
  const ledgerEntries = await registrationLedgerRepository.findByEventId(eventId);
  const capMode = event.capacityMode || 'per_registration';
  const counts = computeEventCounts(eventParticipants, capMode);

  const active = eventParticipants.filter((p) => p.registrationStatus !== 'cancelled');
  const noShows = active.filter((p) => p.registeredAt && !p.checkedInAt);
  const waitlisted = active.filter((p) => p.registrationStatus === 'waitlist');
  const onHold = active.filter((p) => p.registrationStatus === 'on_hold');
  const cancelled = eventParticipants.filter((p) => p.registrationStatus === 'cancelled');

  // Fetch expenses for this event (linked by eventName)
  const allExpenses = await expenseRepository.findAll();
  const eventExpenses = allExpenses.filter((e) => e.eventName === event.name);
  const totalExpenses = eventExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);

  return {
    event,
    totalRegistrations: counts.totalRegistered,
    totalCheckins: counts.totalCheckins,
    memberCheckins: counts.memberCheckins,
    guestCheckins: counts.guestCheckins,
    totalGuests: counts.totalGuests,
    walkIns: counts.totalWalkins,
    noShows: noShows.length,
    waitlisted: waitlisted.length,
    onHold: onHold.length,
    cancelled: cancelled.length,
    participants: eventParticipants,
    totalExpenses,
    ledgerEntries,
  };
}

/**
 * Lookup member/guest by email or phone for registration/checkin.
 * Searches member email, spouse email, and phone numbers.
 */
export async function lookup(eventId: string, email: string, phone?: string) {
  const emailLower = email.toLowerCase().trim();
  const phoneDigits = (phone || '').replace(/\D/g, '');

  const [allEvents, allParticipants, members, guests] = await Promise.all([
    eventRepository.findAll(),
    eventParticipantRepository.findByEventId(eventId),
    memberRepository.findAll(),
    guestRepository.findAll(),
  ]);

  const thisEvent = allEvents.find((e) => e.id === eventId);
  const guestPolicy = parseGuestPolicy(thisEvent?.guestPolicy || '');

  // If only phone was provided (no email), resolve email from member/guest records first
  let resolvedEmail = emailLower;
  if (!emailLower && phoneDigits) {
    const memberByPhone = members.find((m) => {
      const mp = (m.phone || '').replace(/\D/g, '');
      const hp = (m.homePhone || '').replace(/\D/g, '');
      const cp = (m.cellPhone || '').replace(/\D/g, '');
      const sp = (m.spousePhone || '').replace(/\D/g, '');
      return (mp && mp === phoneDigits) || (hp && hp === phoneDigits) ||
        (cp && cp === phoneDigits) || (sp && sp === phoneDigits);
    });
    if (memberByPhone) {
      resolvedEmail = (memberByPhone.email || '').toLowerCase().trim();
    } else {
      const guestByPhone = guests.find((g) => {
        const gp = (g.phone || '').replace(/\D/g, '');
        return gp && gp === phoneDigits;
      });
      if (guestByPhone) {
        resolvedEmail = (guestByPhone.email || '').toLowerCase().trim();
      }
    }
  }

  // Check existing participation for this event
  const existingParticipant = allParticipants.find(
    (p) => p.email?.toLowerCase().trim() === resolvedEmail && p.registrationStatus !== 'cancelled',
  );

  // Already checked in
  if (existingParticipant?.checkedInAt) {
    return {
      status: 'already_checked_in',
      name: existingParticipant.name,
      checkedInAt: existingParticipant.checkedInAt,
    };
  }

  // Check if spouse already registered/checked-in for this event
  if (!existingParticipant) {
    const member = members.find(
      (m) =>
        m.email?.toLowerCase().trim() === resolvedEmail ||
        m.spouseEmail?.toLowerCase().trim() === resolvedEmail,
    );
    if (member) {
      const memberEmail = member.email?.toLowerCase().trim() || '';
      const spouseEmail = member.spouseEmail?.toLowerCase().trim() || '';
      const otherEmail = memberEmail === resolvedEmail ? spouseEmail : memberEmail;
      if (otherEmail) {
        const spouseParticipant = allParticipants.find(
          (p) => p.email?.toLowerCase().trim() === otherEmail && p.registrationStatus !== 'cancelled',
        );
        if (spouseParticipant) {
          const isLookerMember = memberEmail === resolvedEmail;
          const lookerName = isLookerMember ? (member.name || 'Member') : (member.spouseName || 'Spouse');
          const registrantName = isLookerMember ? (member.spouseName || 'Spouse') : (member.name || 'Member');

          return {
            status: 'already_registered_spouse',
            memberId: member.id,
            name: lookerName,
            email: resolvedEmail,
            phone: isLookerMember ? (member.phone || '') : (member.spousePhone || ''),
            spouseEmail: otherEmail,
            memberStatus: member.status || '',
            checkedInAt: spouseParticipant.checkedInAt || '',
            registrantName: registrantName,
            registrationData: spouseParticipant.registeredAt ? {
              participantId: spouseParticipant.id,
              registeredAdults: parseInt(spouseParticipant.registeredAdults || '0', 10),
              registeredKids: parseInt(spouseParticipant.registeredKids || '0', 10),
              selectedActivities: spouseParticipant.selectedActivities || '',
              customFields: spouseParticipant.customFields || '',
              totalPrice: spouseParticipant.totalPrice || '0',
              paymentStatus: spouseParticipant.paymentStatus || '',
              attendeeNames: spouseParticipant.attendeeNames || '',
              registrationStatus: spouseParticipant.registrationStatus || 'confirmed',
              emailConsent: spouseParticipant.emailConsent || 'true',
              mediaConsent: spouseParticipant.mediaConsent || '',
            } : undefined,
            guestPolicy,
          };
        }
      }
    }
  }

  // Has existing registration (not yet checked in) — return registration data for pre-fill
  let registrationData: {
    participantId: string;
    registeredAdults: number;
    registeredKids: number;
    selectedActivities: string;
    customFields: string;
    totalPrice: string;
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
    attendeeNames: string;
    registrationStatus: string;
    emailConsent: string;
    mediaConsent: string;
  } | undefined;

  if (existingParticipant?.registeredAt) {
    registrationData = {
      participantId: existingParticipant.id,
      registeredAdults: parseInt(existingParticipant.registeredAdults || '0', 10),
      registeredKids: parseInt(existingParticipant.registeredKids || '0', 10),
      selectedActivities: existingParticipant.selectedActivities || '',
      customFields: existingParticipant.customFields || '',
      totalPrice: existingParticipant.totalPrice || '0',
      paymentStatus: existingParticipant.paymentStatus || '',
      paymentMethod: existingParticipant.paymentMethod || '',
      transactionId: existingParticipant.transactionId || '',
      attendeeNames: existingParticipant.attendeeNames || '',
      registrationStatus: existingParticipant.registrationStatus || 'confirmed',
      emailConsent: existingParticipant.emailConsent || 'true',
      mediaConsent: existingParticipant.mediaConsent || '',
    };
  }

  // Check members
  const member = members.find(
    (m) =>
      m.email?.toLowerCase().trim() === resolvedEmail ||
      m.spouseEmail?.toLowerCase().trim() === resolvedEmail,
  );

  if (member) {
    // When the lookup email is the spouse email, return the spouse's identity
    // so the registration is filed under the correct email and the auth check passes.
    const isSpouseLookup = member.spouseEmail?.toLowerCase().trim() === resolvedEmail;

    // --- Registrant's own fields ---
    // Primary member: use member table fields.
    // Spouse registrant: use member_spouses fields (nativePlace, college, etc.).
    const lookupName = isSpouseLookup ? (member.spouseName || '') : (member.name || '');
    const lookupEmail = isSpouseLookup ? (member.spouseEmail || '') : (member.email || '');
    const lookupPhone = isSpouseLookup ? (member.spousePhone || '') : (member.phone || '');
    const lookupQualifyingDegree = isSpouseLookup ? (member.spouseQualifyingDegree || '') : (member.qualifyingDegree || '');
    const lookupNativePlace = isSpouseLookup ? (member.spouseNativePlace || '') : (member.nativePlace || '');
    const lookupCollege = isSpouseLookup ? (member.spouseCollege || '') : (member.college || '');
    // jobTitle / employer / specialInterests are not stored per-spouse
    const lookupJobTitle = isSpouseLookup ? '' : (member.jobTitle || '');
    const lookupEmployer = isSpouseLookup ? (member.spouseCompany || '') : (member.employer || '');
    const lookupSpecialInterests = isSpouseLookup ? '' : (member.specialInterests || '');

    // --- Partner's fields (shown in "Spouse Details" section) ---
    // Primary member: partner = spouse from member_spouses.
    // Spouse registrant: partner = primary member from member table.
    const partnerName = isSpouseLookup ? (member.name || '') : (member.spouseName || '');
    const partnerEmail = isSpouseLookup ? (member.email || '') : (member.spouseEmail || '');
    const partnerPhone = isSpouseLookup ? (member.phone || '') : (member.spousePhone || '');
    const partnerNativePlace = isSpouseLookup ? (member.nativePlace || '') : (member.spouseNativePlace || '');
    // Spouse registrant's partner is the primary member — use employer as company equivalent
    const partnerCompany = isSpouseLookup ? (member.employer || '') : (member.spouseCompany || '');
    const partnerCollege = isSpouseLookup ? (member.college || '') : (member.spouseCollege || '');
    const partnerQualifyingDegree = isSpouseLookup ? (member.qualifyingDegree || '') : (member.spouseQualifyingDegree || '');

    if (member.status === 'Active') {
      const profileComplete = !!member.address?.trim();
      const missingFields: string[] = [];
      if (!profileComplete) missingFields.push('address');

      return {
        status: 'member_active',
        memberId: member.id,
        name: lookupName,
        email: lookupEmail,
        phone: lookupPhone,
        homePhone: member.homePhone || '',
        cellPhone: member.cellPhone || '',
        address: member.address || '',
        qualifyingDegree: lookupQualifyingDegree,
        nativePlace: lookupNativePlace,
        college: lookupCollege,
        jobTitle: lookupJobTitle,
        employer: lookupEmployer,
        specialInterests: lookupSpecialInterests,
        spouseName: partnerName,
        spouseEmail: partnerEmail,
        spousePhone: partnerPhone,
        spouseNativePlace: partnerNativePlace,
        spouseCompany: partnerCompany,
        spouseCollege: partnerCollege,
        spouseQualifyingDegree: partnerQualifyingDegree,
        children: member.children || '',
        membershipType: member.membershipType || '',
        membershipLevel: member.membershipLevel || '',
        memberStatus: member.status || '',
        payments: member.payments || '[]',
        sponsors: member.sponsors || '[]',
        profileComplete,
        missingFields,

        registrationData,
        guestPolicy,
      };
    } else {
      return {
        status: 'member_expired',
        memberId: member.id,
        name: lookupName,
        email: lookupEmail,
        phone: lookupPhone,
        homePhone: member.homePhone || '',
        cellPhone: member.cellPhone || '',
        address: member.address || '',
        qualifyingDegree: lookupQualifyingDegree,
        nativePlace: lookupNativePlace,
        college: lookupCollege,
        jobTitle: lookupJobTitle,
        employer: lookupEmployer,
        specialInterests: lookupSpecialInterests,
        spouseName: partnerName,
        spouseEmail: partnerEmail,
        spousePhone: partnerPhone,
        spouseNativePlace: partnerNativePlace,
        spouseCompany: partnerCompany,
        spouseCollege: partnerCollege,
        spouseQualifyingDegree: partnerQualifyingDegree,
        children: member.children || '',
        membershipType: member.membershipType || '',
        membershipLevel: member.membershipLevel || '',
        memberStatus: member.status,
        payments: member.payments || '[]',
        sponsors: member.sponsors || '[]',

        registrationData,
        guestPolicy,
      };
    }
  }

  // Check guests
  const guest = guests.find(
    (g) => g.email?.toLowerCase().trim() === resolvedEmail,
  );

  if (guest) {
    return {
      status: 'returning_guest',
      guestId: guest.id,
      name: guest.name,
      email: guest.email || '',
      phone: guest.phone || '',
      city: guest.city,
      referredBy: guest.referredBy,
      registrationData,
      guestPolicy,
    };
  }

  // Check for pending membership application
  const existingApplications = await membershipApplicationRepository.findByEmail(resolvedEmail);
  const hasPendingApplication = existingApplications.some((app) => app.status === 'Pending');
  if (hasPendingApplication) {
    return {
      status: 'pending_application',
      email: resolvedEmail,
      message: 'You have a pending membership application under review. Please wait for approval before registering for events, or contact us for assistance.',
      guestPolicy,
    };
  }

  return { status: 'not_found', registrationData, guestPolicy };
}

/**
 * Find or create a Guest record by email.
 */
async function findOrCreateGuest(
  emailLower: string,
  data: { name: string; phone: string; city: string; referredBy: string },
  incrementAttended: boolean,
): Promise<string> {
  const guests = await guestRepository.findAll();
  const existingGuest = guests.find(
    (g) => g.email?.toLowerCase().trim() === emailLower,
  );
  const now = new Date().toISOString();

  if (existingGuest) {
    if (incrementAttended) {
      const attended = parseInt(existingGuest.eventsAttended || '0', 10) + 1;
      await guestRepository.update(existingGuest.id, {
        ...existingGuest,
        eventsAttended: attended,
        lastEventDate: now.split('T')[0],
        updatedAt: now,
      });
    }
    return existingGuest.id;
  }

  const guestId = generateId();
  await guestRepository.create({
    id: guestId,
    name: data.name,
    email: emailLower,
    phone: data.phone,
    city: data.city,
    referredBy: data.referredBy,
    eventsAttended: incrementAttended ? 1 : 0,
    lastEventDate: incrementAttended ? now.split('T')[0] : '',
    createdAt: now,
    updatedAt: now,
  });
  return guestId;
}

/**
 * Find if a spouse has already registered/checked-in for this event.
 * Given an email, find the member record where this email is either the
 * primary or spouse email, then check if the *other* email already has
 * a participation record for the event.
 */
async function findSpouseParticipation(
  eventId: string,
  email: string,
): Promise<{ spouseName: string; spouseEmail: string } | null> {
  const emailLower = email.toLowerCase().trim();
  const members = await memberRepository.findAll();

  const member = members.find(
    (m) =>
      m.email?.toLowerCase().trim() === emailLower ||
      m.spouseEmail?.toLowerCase().trim() === emailLower,
  );
  if (!member) return null;

  // Determine the "other" email (the spouse)
  const memberEmail = member.email?.toLowerCase().trim() || '';
  const spouseEmail = member.spouseEmail?.toLowerCase().trim() || '';
  const otherEmail = memberEmail === emailLower ? spouseEmail : memberEmail;
  if (!otherEmail) return null;

  const existing = await eventParticipantRepository.findByEventIdAndEmail(eventId, otherEmail);
  if (existing && existing.registrationStatus !== 'cancelled') {
    const otherName = memberEmail === emailLower
      ? (member.spouseName || 'Spouse')
      : (member.name || 'Member');
    return { spouseName: otherName, spouseEmail: otherEmail };
  }
  return null;
}

/**
 * Record a lifecycle event onto the append-only registration ledger —
 * registered/edited/cancelled snapshots, or a charge/refund. Never updated
 * or deleted after insert; see registration-ledger.repository.ts.
 */
async function recordLedgerEntry(opts: {
  eventId: string;
  participantId: string;
  email: string;
  type: 'registered' | 'edited' | 'cancelled' | 'charge' | 'refund';
  amount?: string;
  method?: string;
  transactionId?: string;
  snapshot?: Record<string, unknown>;
  note?: string;
}): Promise<void> {
  await registrationLedgerRepository.create({
    eventId: opts.eventId,
    participantId: opts.participantId,
    email: opts.email,
    type: opts.type,
    amount: opts.amount,
    method: opts.method,
    transactionId: opts.transactionId,
    snapshot: opts.snapshot ? JSON.stringify(opts.snapshot) : undefined,
    note: opts.note,
  });
}

/**
 * Assign consecutive chest numbers to newly-added performance slots within a
 * selectedActivities JSON string, preserving chest numbers already assigned
 * to existing slots (co-performers in the same slot share a number). Used by
 * both new registrations and edits that add a performance, so a slot never
 * gets renumbered once assigned.
 */
function assignChestNumbers(
  selectedActivitiesJson: string,
  allParticipants: Record<string, string>[],
  opts: { excludeParticipantId?: string; mode?: ReturnType<typeof parseActivityMode> } = {},
): string {
  if (!selectedActivitiesJson) return selectedActivitiesJson;
  // Ticketed events have no physical badge to number — a ticket tier
  // selection is priced and tracked without ever gaining a chestNumber.
  if (opts.mode === 'ticketed_event') return selectedActivitiesJson;
  let acts: Array<{ activityId: string; slotId?: string; participantName: string; chestNumber?: number }>;
  try {
    acts = JSON.parse(selectedActivitiesJson);
  } catch {
    return selectedActivitiesJson;
  }
  if (!Array.isArray(acts) || acts.length === 0) return selectedActivitiesJson;

  // Chest numbers currently held by any other *active* registration — a
  // cancelled registration's numbers are released back into the pool rather
  // than staying permanently reserved, so new slots fill the lowest free
  // number instead of only ever growing.
  const usedNumbers = new Set<number>();
  for (const p of allParticipants) {
    if (opts.excludeParticipantId && p.id === opts.excludeParticipantId) continue;
    if (p.registrationStatus === 'cancelled') continue;
    if (!p.selectedActivities) continue;
    try {
      const pActs = JSON.parse(String(p.selectedActivities));
      if (Array.isArray(pActs)) {
        for (const a of pActs) {
          if (typeof a.chestNumber === 'number') usedNumbers.add(a.chestNumber);
        }
      }
    } catch { /* ignore */ }
  }
  // Also account for chest numbers already present in the incoming data itself
  // (this participant's own unchanged slots) — otherwise a newly-added slot
  // could collide with a number this same participant already holds, since
  // their own row is excluded from the scan above.
  for (const act of acts) {
    if (typeof act.chestNumber === 'number') usedNumbers.add(act.chestNumber);
  }

  let nextCandidate = 1;
  const claimNextAvailable = (): number => {
    while (usedNumbers.has(nextCandidate)) nextCandidate++;
    usedNumbers.add(nextCandidate);
    return nextCandidate;
  };

  const slotToChestNum = new Map<string, number>();
  for (const act of acts) {
    const slotKey = act.slotId || act.activityId;
    if (typeof act.chestNumber === 'number') {
      // Already numbered (e.g. unchanged existing slot during an edit) — keep it.
      if (!slotToChestNum.has(slotKey)) slotToChestNum.set(slotKey, act.chestNumber);
      continue;
    }
    if (!slotToChestNum.has(slotKey)) {
      slotToChestNum.set(slotKey, claimNextAvailable());
    }
    act.chestNumber = slotToChestNum.get(slotKey);
  }
  return JSON.stringify(acts);
}

/**
 * Register a participant for an event. Public endpoint.
 */
export async function registerParticipant(
  eventId: string,
  data: {
    type: 'Member' | 'Guest';
    memberId: string;
    guestId: string;
    name: string;
    email: string;
    phone: string;
    adults: number;
    kids: number;
    totalPrice: string;
    priceBreakdown: string;
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
    selectedActivities?: string;
    customFields?: string;
    city?: string;
    referredBy?: string;
    membershipRenewal?: string;
    attendeeNames?: string;
    emailConsent?: string;
    mediaConsent?: string;
  },
) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.status !== 'Upcoming') {
    throw new Error('Event is not open for registration');
  }
  if (event.registrationOpen?.toLowerCase() !== 'true') {
    throw new Error('Registration is currently closed for this event');
  }

  const emailLower = data.email.toLowerCase().trim();

  // Guest policy enforcement
  if (data.type === 'Guest') {
    const guestPolicy = parseGuestPolicy(event.guestPolicy || '');
    if (!guestPolicy.allowGuests || guestPolicy.guestAction === 'blocked') {
      throw new Error(guestPolicy.guestMessage || 'Guest registration is not allowed for this event');
    }
  }

  // Prevent duplicate registration (allow re-registration if previous was cancelled).
  // Cancelled rows are never deleted — they're kept as permanent history — so
  // re-registering after a cancellation simply creates a new row alongside it.
  const allParticipantsForCheck = await eventParticipantRepository.findByEventId(eventId);
  const existingForEmail = allParticipantsForCheck.filter(
    (p) => p.email?.toLowerCase() === emailLower,
  );
  for (const existing of existingForEmail) {
    if (existing.registrationStatus !== 'cancelled') {
      throw new Error('Already registered for this event');
    }
  }

  // Check for pending membership application
  const existingApplications = await membershipApplicationRepository.findByEmail(emailLower);
  const hasPendingApplication = existingApplications.some((app) => app.status === 'Pending');
  if (hasPendingApplication) {
    throw new Error('You have a pending membership application under review. Please wait for approval before registering for events, or contact us for assistance.');
  }

  // Prevent spouse duplicate — if the other email on the same membership already registered
  const spouseMatch = await findSpouseParticipation(eventId, emailLower);
  if (spouseMatch) {
    throw new Error(`Already registered under ${spouseMatch.spouseName} (${spouseMatch.spouseEmail})`);
  }

  // Determine registration status based on capacity and payment method
  const capacityNum = parseInt(String(event.capacity || '0'), 10) || 0;
  const capMode = event.capacityMode || 'per_registration';
  let registrationStatus = 'confirmed';

  // Zelle payments require manual verification, so set status to 'on_hold'
  const isZellePayment = data.paymentMethod === 'zelle';
  if (isZellePayment) {
    registrationStatus = 'on_hold';
  } else if (capacityNum > 0) {
    // Check capacity constraints for non-Zelle payments
    const allParticipants = await eventParticipantRepository.findByEventId(eventId);
    const confirmedParticipants = allParticipants.filter(
      (p) => p.registeredAt && (p.registrationStatus || 'confirmed') === 'confirmed' && p.registrationStatus !== 'cancelled',
    );
    const usedCapacity = countCapacityUsed(confirmedParticipants, capMode);
    const incomingUnits = countRegistrationUnits(data.adults, data.kids, capMode);
    if (usedCapacity + incomingUnits > capacityNum) {
      // Add to waitlist when capacity is exceeded
      registrationStatus = 'waitlist';
    }
  }

  const now = new Date().toISOString();
  const isMember = data.type === 'Member';

  let guestId = data.guestId;
  if (!isMember && !guestId) {
    guestId = await findOrCreateGuest(emailLower, {
      name: data.name,
      phone: data.phone,
      city: data.city || '',
      referredBy: data.referredBy || '',
    }, false);
  }

  // Enforce event-level maxSlots cap on total performance registrations
  const eventMaxSlots = parseActivityMaxSlots(event.activities || '');
  if (eventMaxSlots && data.selectedActivities) {
    try {
      const incomingActs: Array<{ activityId?: string; slotId?: string }> = JSON.parse(data.selectedActivities);
      if (Array.isArray(incomingActs) && incomingActs.length > 0) {
        // Count existing unique slots across all non-cancelled participants
        const existingSlotIds = new Set<string>();
        for (const p of allParticipantsForCheck.filter((p) => p.registrationStatus !== 'cancelled')) {
          if (!p.selectedActivities) continue;
          try {
            const pActs: Array<{ activityId?: string; slotId?: string }> = JSON.parse(String(p.selectedActivities));
            if (!Array.isArray(pActs)) continue;
            for (const a of pActs) {
              if (a.activityId) existingSlotIds.add(a.slotId || `${p.id}_${a.activityId}`);
            }
          } catch { /* ignore */ }
        }
        // Count unique slots in this incoming registration
        const incomingSlotIds = new Set<string>();
        for (const a of incomingActs) {
          if (a.activityId) incomingSlotIds.add(a.slotId || a.activityId);
        }
        if (existingSlotIds.size + incomingSlotIds.size > eventMaxSlots) {
          throw new Error(`Performance registrations are full for this event (max ${eventMaxSlots} slots).`);
        }
      }
    } catch (e) {
      if ((e as Error).message.startsWith('Performance registrations are full')) throw e;
    }
  }

  // Assign consecutive chest numbers to each unique performance slot
  const processedActivities = assignChestNumbers(data.selectedActivities || '', allParticipantsForCheck, {
    mode: parseActivityMode(event.activities || ''),
  });

  const record = {
    id: generateId(),
    eventId,
    type: isMember ? 'Member' : 'Guest',
    memberId: data.memberId || '',
    guestId: guestId || '',
    name: data.name,
    email: emailLower,
    phone: data.phone || '',
    registeredAdults: String(data.adults || 0),
    registeredKids: String(data.kids || 0),
    registeredAt: now,
    actualAdults: '',
    actualKids: '',
    checkedInAt: '',
    selectedActivities: processedActivities,
    customFields: data.customFields || '',
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    paymentStatus: data.paymentStatus || '',
    paymentMethod: data.paymentMethod || '',
    transactionId: data.transactionId || '',
    registrationStatus,
    attendeeNames: data.attendeeNames || '',
    emailConsent: data.emailConsent || 'true',
    mediaConsent: data.mediaConsent || '',
  };

  await eventParticipantRepository.create(record);

  await recordLedgerEntry({
    eventId,
    participantId: record.id,
    email: emailLower,
    type: 'registered',
    snapshot: {
      adults: data.adults || 0,
      kids: data.kids || 0,
      totalPrice: data.totalPrice || '0',
      registrationStatus,
      selectedActivitiesAfter: processedActivities,
    },
  });
  const registeredAmount = parseFloat(data.totalPrice || '0');
  if (data.paymentStatus && registeredAmount > 0) {
    await recordLedgerEntry({
      eventId,
      participantId: record.id,
      email: emailLower,
      type: 'charge',
      amount: String(registeredAmount),
      method: data.paymentMethod || '',
      transactionId: data.transactionId || '',
      note: 'Initial registration payment',
    });
  }

  // Split membership vs event amounts for income records
  const membershipAmount = parseFloat(data.membershipRenewal || '0');
  const eventAmount = parseFloat(data.totalPrice || '0') - membershipAmount;

  // Create Event income record (event-only portion)
  await createIncomeFromPayment({
    eventName: event.name,
    amount: String(Math.max(0, eventAmount)),
    payerName: data.name,
    paymentMethod: data.paymentMethod,
    source: 'registration',
  });

  // Create Membership income record and renew member if applicable
  if (membershipAmount > 0 && data.memberId) {
    await renewMembership({
      memberId: data.memberId,
      amount: String(membershipAmount),
      payerName: data.name,
      paymentMethod: data.paymentMethod,
      eventName: event.name,
    });
  }

  // Send registration confirmation email to participant (and spouse if available)
  try {
    const emailSubject = registrationStatus === 'waitlist'
      ? `Waitlisted: ${event.name}`
      : `Registration Confirmed: ${event.name}`;
    const history = await registrationLedgerRepository.findByParticipantId(record.id) as unknown as EmailLedgerEntry[];
    const { eventSponsors, generalSponsors } = await getPublicSponsors({ eventId, year: event.date?.slice(0, 4) });
    const emailHtml = buildRegistrationLifecycleEmail({
      type: 'created',
      participantName: data.name,
      eventName: event.name,
      eventDate: event.date,
      adults: data.adults,
      kids: data.kids,
      registrationStatus,
      totalPrice: data.totalPrice || '0',
      priceBreakdownJson: data.priceBreakdown || '',
      paymentMethod: data.paymentMethod || '',
      selectedActivitiesJson: processedActivities,
      activities: parseActivities(event.activities || ''),
      history,
      eventHomeUrl: `${getAppUrl()}/events/${eventId}/home`,
      eventDescription: event.description || '',
      customEmailMessage: event.customEmailMessage ? formatCustomMessage(event.customEmailMessage) : '',
      eventSponsors,
      generalSponsors,
    });

    const recipients = [emailLower];
    if (data.memberId) {
      try {
        const member = await memberRepository.findById(data.memberId);
        const spouseEmail = member?.spouseEmail?.toLowerCase().trim();
        if (spouseEmail && spouseEmail !== emailLower) {
          recipients.push(spouseEmail);
        }
      } catch { /* ignore lookup failure */ }
    }

    await sendEmail(recipients, emailSubject, emailHtml, 'system');
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Registration confirmation email failed' } });
  }

  // Alert category contact about new registration
  if (event.category) {
    try {
      const [catEmail, logoUrl] = await Promise.all([
        getCategoryEmail(event.category),
        getCategoryLogoUrl(event.category),
      ]);
      if (catEmail) {
        await sendEmail(
          [catEmail],
          `New Registration: ${data.name} for ${event.name}`,
          buildCategoryAlertEmail({
            participantName: data.name,
            participantEmail: emailLower,
            participantType: data.type,
            eventName: event.name,
            eventDate: event.date || '',
            logoUrl,
            adults: data.adults,
            kids: data.kids,
            totalPrice: data.totalPrice || '0',
            paymentMethod: data.paymentMethod || '',
          }),
          'system',
        );
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Category alert email failed' } });
    }
  }

  return record;
}

/**
 * Check in a participant. Public endpoint.
 * Pre-registered: updates existing row. Walk-in: creates new row.
 */
export async function checkinParticipant(
  eventId: string,
  data: {
    type: 'Member' | 'Guest';
    memberId: string;
    guestId: string;
    name: string;
    email: string;
    phone: string;
    adults: number;
    kids: number;
    totalPrice: string;
    priceBreakdown: string;
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
    selectedActivities?: string;
    customFields?: string;
    city?: string;
    referredBy?: string;
    attendeeNames?: string;
    emailConsent?: string;
    mediaConsent?: string;
  },
) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.status === 'Cancelled') {
    throw new Error('Event is cancelled');
  }

  const emailLower = data.email.toLowerCase().trim();
  const now = new Date().toISOString();

  // Sponsor lookup is only used for the confirmation email below — a
  // failure here must never block check-in itself, so it's isolated with
  // its own try/catch and a safe empty-array fallback.
  let eventSponsors: PublicSponsor[] = [];
  let generalSponsors: PublicSponsor[] = [];
  try {
    ({ eventSponsors, generalSponsors } = await getPublicSponsors({ eventId, year: event.date?.slice(0, 4) }));
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Sponsor lookup failed during check-in', eventId } });
  }

  // Guest policy enforcement for walk-ins
  if (data.type === 'Guest') {
    const guestPolicy = parseGuestPolicy(event.guestPolicy || '');
    if (!guestPolicy.allowGuests || guestPolicy.guestAction === 'blocked') {
      throw new Error(guestPolicy.guestMessage || 'Guest check-in is not allowed for this event');
    }
  }

  // Check for pending membership application for non-members
  if (data.type === 'Guest') {
    const existingApplications = await membershipApplicationRepository.findByEmail(emailLower);
    const hasPendingApplication = existingApplications.some((app) => app.status === 'Pending');
    if (hasPendingApplication) {
      throw new Error('You have a pending membership application under review. Please wait for approval before checking in to events, or contact us for assistance.');
    }
  }

  // Check for existing participant row (pre-registered or already checked in)
  const existing = await eventParticipantRepository.findByEventIdAndEmail(eventId, emailLower);

  if (existing) {
    // Check if user is on waitlist
    if (existing.registrationStatus === 'waitlist') {
      throw new Error('You are on the waitlist for this event. Please wait to be notified when a spot becomes available.');
    }

    // Already checked in
    if (existing.checkedInAt) {
      return { alreadyCheckedIn: true, checkedInAt: existing.checkedInAt };
    }

    // Pre-registered — update the row with check-in data
    const updated: Record<string, string> = {
      ...existing,
      actualAdults: String(data.adults || 0),
      actualKids: String(data.kids || 0),
      checkedInAt: now,
      emailConsent: data.emailConsent ?? existing.emailConsent ?? 'true',
      mediaConsent: data.mediaConsent ?? existing.mediaConsent ?? '',
    };
    // Update payment if provided (and not already paid)
    if (data.paymentStatus && !existing.paymentStatus) {
      updated.totalPrice = data.totalPrice || existing.totalPrice || '0';
      updated.priceBreakdown = data.priceBreakdown || existing.priceBreakdown || '';
      updated.paymentStatus = data.paymentStatus;
      updated.paymentMethod = data.paymentMethod || '';
      updated.transactionId = data.transactionId || '';
    }
    await eventParticipantRepository.update(existing.id, updated);

    // Create income record if new payment
    if (data.paymentStatus && !existing.paymentStatus) {
      await createIncomeFromPayment({
        eventName: event.name,
        amount: data.totalPrice,
        payerName: data.name,
        paymentMethod: data.paymentMethod,
        source: 'checkin',
      });
    }

    // Send check-in confirmation email
    try {
      const logoUrl = await getCategoryLogoUrl(event.category || '');
      await sendEmail(
        [emailLower],
        `Check-in Confirmed: ${event.name}`,
        buildCheckinConfirmationEmail({
          participantName: data.name,
          eventName: event.name,
          eventDate: event.date,
          eventId,
          eventDescription: event.description || '',
          eventCategory: event.category || '',
          logoUrl,
          adults: data.adults,
          kids: data.kids,
          customEmailMessage: event.customEmailMessage || '',
          eventSponsors,
          generalSponsors,
        }),
        'system',
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Check-in confirmation email failed' } });
    }

    // Record attendance for engagement scoring
    await recordAttendance(eventId, emailLower, existing.memberId || null, now)
      .catch((err) => Sentry.captureException(err, { extra: { context: 'Record attendance failed' } }));

    return { ...updated, checkedInAt: now };
  }

  // Spouse check-in: if spouse already has a family registration, check in under it
  const spouseMatch = await findSpouseParticipation(eventId, emailLower);
  if (spouseMatch) {
    const spouseParticipant = await eventParticipantRepository.findByEventIdAndEmail(eventId, spouseMatch.spouseEmail);
    if (spouseParticipant) {
      if (spouseParticipant.checkedInAt) {
        return { alreadyCheckedIn: true, checkedInAt: spouseParticipant.checkedInAt };
      }
      const updated: Record<string, string> = {
        ...spouseParticipant,
        actualAdults: String(data.adults || 0),
        actualKids: String(data.kids || 0),
        checkedInAt: now,
        emailConsent: data.emailConsent ?? spouseParticipant.emailConsent ?? 'true',
        mediaConsent: data.mediaConsent ?? spouseParticipant.mediaConsent ?? '',
      };
      if (data.paymentStatus && !spouseParticipant.paymentStatus) {
        updated.totalPrice = data.totalPrice || spouseParticipant.totalPrice || '0';
        updated.priceBreakdown = data.priceBreakdown || spouseParticipant.priceBreakdown || '';
        updated.paymentStatus = data.paymentStatus;
        updated.paymentMethod = data.paymentMethod || '';
        updated.transactionId = data.transactionId || '';
      }
      await eventParticipantRepository.update(spouseParticipant.id, updated);

      if (data.paymentStatus && !spouseParticipant.paymentStatus) {
        await createIncomeFromPayment({
          eventName: event.name,
          amount: data.totalPrice,
          payerName: data.name,
          paymentMethod: data.paymentMethod,
          source: 'checkin',
        });
      }

      await recordAttendance(eventId, emailLower, data.memberId || null, now)
        .catch((err) => Sentry.captureException(err, { extra: { context: 'Record attendance failed' } }));

      try {
        const logoUrl = await getCategoryLogoUrl(event.category || '');
        await sendEmail(
          [emailLower],
          `Check-in Confirmed: ${event.name}`,
          buildCheckinConfirmationEmail({
            participantName: data.name,
            eventName: event.name,
            eventDate: event.date,
            eventId,
            eventDescription: event.description || '',
            eventCategory: event.category || '',
            logoUrl,
            adults: data.adults,
            kids: data.kids,
            customEmailMessage: event.customEmailMessage || '',
            eventSponsors,
            generalSponsors,
          }),
          'system',
        );
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'Check-in confirmation email failed' } });
      }

      return { ...updated, checkedInAt: now };
    }
  }

  const isMember = data.type === 'Member';

  let guestId = data.guestId;
  if (!isMember) {
    guestId = await findOrCreateGuest(emailLower, {
      name: data.name,
      phone: data.phone,
      city: data.city || '',
      referredBy: data.referredBy || '',
    }, true);
  }

  const record = {
    id: generateId(),
    eventId,
    type: isMember ? 'Member' : 'Guest',
    memberId: data.memberId || '',
    guestId: guestId || '',
    name: data.name,
    email: emailLower,
    phone: data.phone || '',
    registeredAdults: '',
    registeredKids: '',
    registeredAt: '',
    actualAdults: String(data.adults || 0),
    actualKids: String(data.kids || 0),
    checkedInAt: now,
    selectedActivities: data.selectedActivities || '',
    customFields: data.customFields || '',
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    paymentStatus: data.paymentStatus || '',
    paymentMethod: data.paymentMethod || '',
    transactionId: data.transactionId || '',
    attendeeNames: data.attendeeNames || '',
    emailConsent: data.emailConsent || 'true',
    mediaConsent: data.mediaConsent || '',
  };

  await eventParticipantRepository.create(record);

  // Create income record if payment was made
  await createIncomeFromPayment({
    eventName: event.name,
    amount: data.totalPrice,
    payerName: data.name,
    paymentMethod: data.paymentMethod,
    source: 'checkin',
  });

  // Record attendance for engagement scoring
  await recordAttendance(eventId, emailLower, data.memberId || null, now)
    .catch((err) => Sentry.captureException(err, { extra: { context: 'Record attendance failed' } }));

  // Send check-in confirmation email
  try {
    const logoUrl = await getCategoryLogoUrl(event.category || '');
    await sendEmail(
      [emailLower],
      `Check-in Confirmed: ${event.name}`,
      buildCheckinConfirmationEmail({
        participantName: data.name,
        eventName: event.name,
        eventDate: event.date,
        eventId,
        eventDescription: event.description || '',
        eventCategory: event.category || '',
        logoUrl,
        adults: data.adults,
        kids: data.kids,
        customEmailMessage: event.customEmailMessage || '',
        eventSponsors,
        generalSponsors,
      }),
      'system',
    );
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Check-in confirmation email failed' } });
  }

  return record;
}

type RegistrationRefundOutcome = Awaited<ReturnType<typeof refundRegistrationPayment>>;

/**
 * Recompute the canonical price for a registration server-side from the
 * event's pricing rules, instead of trusting a client-submitted total. Used
 * for anything that moves money (self-service edits). `registrationDate`
 * defaults to today (America/Chicago) — correct for a live edit, since the
 * user is agreeing to current pricing right now.
 */
function computeCanonicalRegistrationPrice(opts: {
  event: Record<string, string>;
  type: string;
  adults: number;
  freeKids: number;
  paidKids: number;
  selectedActivitiesJson: string;
  registrationDate?: string;
}): { total: number; priceBreakdownJson: string } {
  const pricingRules = parsePricingRules(opts.event.pricingRules || '');
  const activityPricingMode = parseActivityPricingMode(opts.event.activityPricingMode || '');
  const activities = parseActivities(opts.event.activities || '');
  const participantType = opts.type === 'Member' ? 'Member' : 'Guest';

  const baseBreakdown = calculatePrice({
    pricingRules,
    type: participantType,
    adults: opts.adults,
    freeKids: opts.freeKids,
    paidKids: opts.paidKids,
    otherSubEventCount: 0,
    registrationDate: opts.registrationDate,
  });

  const selectedActivities = parseActivityRegistrations(opts.selectedActivitiesJson || '');
  const finalBreakdown = calculateActivityPrice(baseBreakdown, activities, selectedActivities, activityPricingMode, pricingRules);

  return { total: finalBreakdown.total, priceBreakdownJson: JSON.stringify(finalBreakdown) };
}

/**
 * Re-derive a stored registration's canonical price using its own historical
 * data (registration date, attendee ages) rather than a client-submitted
 * total. Used to sanity-check a stored `totalPrice` before auto-refunding it
 * on cancellation. Returns null when the free/paid kids split can't be
 * reliably reconstructed (e.g. missing attendee ages on an older record) —
 * callers should treat that as "can't validate" rather than guessing, since a
 * wrong guess would produce a false-positive mismatch.
 */
/**
 * Reconstruct the free/paid kids split for pricing purposes when the caller
 * hasn't explicitly provided one (e.g. an admin action that only touches
 * activities, not attendee counts). Family-priced members don't need a
 * split — total doesn't depend on it. Otherwise derives it from stored
 * attendee ages; returns null if that can't be done reliably.
 */
function deriveFreeAndPaidKids(
  type: string,
  adults: number,
  kids: number,
  attendeeNames: string,
  pricingRules: ReturnType<typeof parsePricingRules>,
): { freeKids: number; paidKids: number } | null {
  const isFamilyMember = type === 'Member' && pricingRules.memberPricingModel === 'family';
  if (isFamilyMember) return { freeKids: kids, paidKids: 0 };
  if (kids <= 0) return { freeKids: 0, paidKids: 0 };
  const kidFreeAge = type === 'Member' ? pricingRules.memberKidFreeUnderAge : pricingRules.guestKidFreeUnderAge;
  return deriveKidsSplitFromAttendeeNames(attendeeNames || '', adults, kids, kidFreeAge);
}

function recomputeStoredRegistrationPrice(row: Record<string, string>, event: Record<string, string>): number | null {
  const pricingRules = parsePricingRules(event.pricingRules || '');
  const adults = parseInt(row.registeredAdults || '0', 10);
  const kids = parseInt(row.registeredKids || '0', 10);

  const split = deriveFreeAndPaidKids(row.type, adults, kids, row.attendeeNames || '', pricingRules);
  if (!split) return null;

  const registrationDate = (row.registeredAt || '').slice(0, 10) || undefined;
  const canonical = computeCanonicalRegistrationPrice({
    event,
    type: row.type,
    adults,
    freeKids: split.freeKids,
    paidKids: split.paidKids,
    selectedActivitiesJson: row.selectedActivities || '',
    registrationDate,
  });
  return canonical.total;
}

/**
 * Cancel a registration and, if it was paid via PayPal/Square, refund it.
 * Before refunding, sanity-checks the stored totalPrice against a fresh
 * recompute from the event's pricing rules (using the participant's original
 * registration date, so an Early Bird window they qualified for at the time
 * still applies). On a mismatch — or when the split can't be reconstructed —
 * the cancellation is NOT performed; the treasurer is notified for manual
 * review instead. Blocks cancellation entirely if the participant has already
 * been checked in.
 */
export async function cancelRegistrationWithRefund(
  participantId: string,
  opts: { isAdminOrCommittee?: boolean } = {},
): Promise<
  | { status: 'cancelled'; refundOutcome?: RegistrationRefundOutcome }
  | { status: 'blocked_checked_in' }
  | { status: 'blocked_discrepancy' }
  | { status: 'already_cancelled' }
> {
  Sentry.addBreadcrumb({
    category: 'cancel',
    message: 'cancelRegistrationWithRefund called',
    level: 'info',
    data: { participantId },
  });

  const row = await eventParticipantRepository.findById(participantId);
  if (!row) throw new NotFoundError('Participant');
  if (row.registrationStatus === 'cancelled') return { status: 'already_cancelled' };
  if (row.checkedInAt) return { status: 'blocked_checked_in' };

  const event = await eventRepository.findById(row.eventId);
  if (!event) throw new NotFoundError('Event');

  const paidAmount = row.paymentStatus === 'paid' ? parseFloat(row.totalPrice || '0') : 0;
  const method = (row.paymentMethod || '').toLowerCase();
  const refundFeatureEnabled = resolveRegistrationFeatures(event).cancelRefundEnabled;
  // Admin-initiated cancellations never auto-refund or email the participant —
  // only self-service (member/guest-initiated) cancellations do.
  const isAutoRefundable = !opts.isAdminOrCommittee && refundFeatureEnabled && paidAmount > 0 && (method === 'paypal' || method === 'square');

  Sentry.addBreadcrumb({
    category: 'cancel',
    message: 'Cancellation refund eligibility resolved',
    level: 'info',
    data: { participantId, eventId: row.eventId, paidAmount, method, refundFeatureEnabled, isAutoRefundable },
  });

  if (isAutoRefundable) {
    const recomputed = recomputeStoredRegistrationPrice(row, event);
    const mismatch = recomputed === null || Math.abs(recomputed - paidAmount) > 0.01;
    if (mismatch) {
      Sentry.captureMessage('Cancellation blocked by price discrepancy', {
        level: 'warning',
        extra: { participantId, eventId: row.eventId, storedAmount: paidAmount, recomputedAmount: recomputed },
      });
      await notifyTreasurer({
        reason: 'price_discrepancy',
        eventId: row.eventId,
        eventName: event.name,
        participantId,
        participantName: row.name,
        participantEmail: row.email,
        amount: row.totalPrice || '0',
        paymentMethod: row.paymentMethod,
        transactionId: row.transactionId,
        recomputedAmount: recomputed === null ? 'unable to recompute' : String(recomputed),
      });
      return { status: 'blocked_discrepancy' };
    }
  }

  let refundOutcome: RegistrationRefundOutcome | undefined;
  if (paidAmount > 0 && !opts.isAdminOrCommittee) {
    refundOutcome = await refundRegistrationPayment({
      participantId,
      eventId: row.eventId,
      eventName: event.name,
      participantName: row.name,
      participantEmail: row.email,
      amount: String(paidAmount),
      reason: `Registration cancelled: ${event.name}`,
      autoRefundEnabled: refundFeatureEnabled,
      fallbackMethod: row.paymentMethod,
      fallbackTransactionId: row.transactionId,
      fallbackAmount: row.totalPrice,
    });
  } else if (paidAmount > 0 && opts.isAdminOrCommittee) {
    // Admin cancellations never auto-refund — alert the treasurer to process
    // it manually, and let the admin dashboard know so it can prompt the
    // admin to follow up directly with the treasurer too.
    const note = 'This cancellation requires a refund — the treasurer has been notified to process it manually.';
    await notifyTreasurer({
      reason: 'manual_refund_needed',
      eventId: row.eventId,
      eventName: event.name,
      participantId,
      participantName: row.name,
      participantEmail: row.email,
      amount: String(paidAmount),
      paymentMethod: row.paymentMethod,
      transactionId: row.transactionId,
      errorMessage: 'Admin-initiated cancellation — refund not attempted automatically.',
    });
    refundOutcome = { status: 'manual', note };
  }

  await eventParticipantRepository.update(participantId, {
    ...row,
    registrationStatus: 'cancelled',
    updatedAt: new Date().toISOString(),
  });

  await recordLedgerEntry({
    eventId: row.eventId,
    participantId,
    email: row.email,
    type: 'cancelled',
    snapshot: { totalPrice: row.totalPrice, paymentStatus: row.paymentStatus },
    note: refundOutcome ? `Refund outcome: ${refundOutcome.status}` : undefined,
  });

  // Admin-initiated cancellations don't notify the participant — only
  // self-service ones do (the participant already knows they cancelled).
  if (!opts.isAdminOrCommittee) {
    try {
      const history = await registrationLedgerRepository.findByParticipantId(participantId) as unknown as EmailLedgerEntry[];
      await sendEmail(
        [row.email],
        `Registration Cancelled: ${event.name}`,
        buildRegistrationLifecycleEmail({
          type: 'cancelled',
          eventName: event.name,
          eventDate: event.date,
          participantName: row.name,
          adults: parseInt(row.registeredAdults || '0', 10),
          kids: parseInt(row.registeredKids || '0', 10),
          totalPrice: row.totalPrice || '0',
          priceBreakdownJson: row.priceBreakdown || '',
          paymentMethod: row.paymentMethod,
          refundStatus: refundOutcome?.status,
          refundNote: refundOutcome && 'note' in refundOutcome ? refundOutcome.note : undefined,
          refundedAmount: refundOutcome && 'refundedAmount' in refundOutcome ? refundOutcome.refundedAmount : undefined,
          history,
          eventHomeUrl: `${getAppUrl()}/events/${row.eventId}/home`,
        }),
        'system',
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Cancellation confirmation email failed', participantId, eventId: row.eventId } });
    }
  }

  Sentry.addBreadcrumb({
    category: 'cancel',
    message: 'Registration marked cancelled',
    level: 'info',
    data: { participantId, eventId: row.eventId, refundStatus: refundOutcome?.status ?? 'n/a' },
  });

  return { status: 'cancelled', refundOutcome };
}

/**
 * Update an existing registration (e.g. change attendee count).
 * Collects additional payment if the new total is higher. Refunds the
 * difference (via PayPal/Square) if lower, unless opts.skipPriceValidation
 * is set (admin/committee edits, which are trusted to override amounts).
 */
export async function updateRegistration(
  participantId: string,
  data: {
    name: string;
    phone: string;
    adults: number;
    kids: number;
    freeKids?: number;
    paidKids?: number;
    totalPrice: string;
    priceBreakdown: string;
    paymentStatus: string;
    paymentMethod: string;
    transactionId: string;
    selectedActivities?: string;
    customFields?: string;
    city?: string;
    referredBy?: string;
    attendeeNames?: string;
  },
  opts: { skipPriceValidation?: boolean; isAdminOrCommittee?: boolean; recomputePrice?: boolean } = {},
): Promise<Record<string, string> & { refundOutcome?: RegistrationRefundOutcome }> {
  const row = await eventParticipantRepository.findById(participantId);
  if (!row) throw new NotFoundError('Participant');

  const event = await eventRepository.findById(row.eventId);
  if (!event) throw new NotFoundError('Event');

  Sentry.addBreadcrumb({
    category: 'registration-edit',
    message: 'updateRegistration called',
    level: 'info',
    data: { participantId, eventId: row.eventId, isAdminOrCommittee: !!opts.isAdminOrCommittee, skipPriceValidation: !!opts.skipPriceValidation, clientTotalPrice: data.totalPrice },
  });

  if (!opts.isAdminOrCommittee && !resolveRegistrationFeatures(event).selfServiceEditEnabled) {
    Sentry.captureMessage('Self-service edit rejected — feature disabled for event', { level: 'warning', extra: { participantId, eventId: row.eventId } });
    throw new Error('Self-service editing is not enabled for this event');
  }

  const now = new Date().toISOString();
  const oldPaidAmount = row.paymentStatus === 'paid'
    ? parseFloat(row.totalPrice || '0')
    : 0;

  // Enforce the event-level max performance slots cap for net-new slots
  // (this participant's own existing slots don't count against themselves).
  const allParticipants = await eventParticipantRepository.findByEventId(row.eventId);
  const eventMaxSlots = parseActivityMaxSlots(event.activities || '');
  if (eventMaxSlots && data.selectedActivities) {
    const incomingSlotIds = new Set(
      parseActivityRegistrations(data.selectedActivities).map((a) => a.slotId || a.activityId),
    );
    const otherSlotIds = new Set<string>();
    for (const p of allParticipants) {
      if (p.id === participantId || p.registrationStatus === 'cancelled' || !p.selectedActivities) continue;
      for (const a of parseActivityRegistrations(String(p.selectedActivities))) {
        otherSlotIds.add(a.slotId || `${p.id}_${a.activityId}`);
      }
    }
    if (otherSlotIds.size + incomingSlotIds.size > eventMaxSlots) {
      Sentry.captureMessage('Registration edit rejected — performance slots at capacity', {
        level: 'warning',
        extra: { participantId, eventId: row.eventId, eventMaxSlots, otherSlots: otherSlotIds.size, incomingSlots: incomingSlotIds.size },
      });
      throw new Error(`Performance registrations are full for this event (max ${eventMaxSlots} slots).`);
    }
  }
  const selectedActivities = assignChestNumbers(data.selectedActivities || '', allParticipants, {
    excludeParticipantId: participantId,
    mode: parseActivityMode(event.activities || ''),
  });

  // Admin edits normally trust the admin's typed total outright
  // (skipPriceValidation), but a specific admin action can force a fresh
  // recompute instead — e.g. adding/removing a performance, where the admin
  // isn't intentionally setting a custom price and the total must reflect
  // whatever's actually selected now.
  const shouldRecomputePrice = !opts.skipPriceValidation || opts.recomputePrice;

  let totalPrice = data.totalPrice || '0';
  let priceBreakdown = data.priceBreakdown || '';
  if (shouldRecomputePrice) {
    const pricingRules = parsePricingRules(event.pricingRules || '');
    let freeKids = data.freeKids;
    let paidKids = data.paidKids;
    if (freeKids === undefined || paidKids === undefined) {
      // Caller didn't provide an explicit split (e.g. a performance-only
      // admin edit that doesn't touch attendee counts) — reconstruct it from
      // stored attendee ages rather than assuming everyone pays.
      const split = deriveFreeAndPaidKids(row.type, data.adults || 0, data.kids || 0, data.attendeeNames ?? row.attendeeNames ?? '', pricingRules);
      freeKids = split?.freeKids ?? 0;
      paidKids = split?.paidKids ?? (data.kids || 0);
    }
    const canonical = computeCanonicalRegistrationPrice({
      event,
      type: row.type,
      adults: data.adults || 0,
      freeKids,
      paidKids,
      selectedActivitiesJson: data.selectedActivities || '',
    });
    const clientTotal = parseFloat(data.totalPrice || '0');
    if (Math.abs(clientTotal - canonical.total) > 0.01) {
      Sentry.addBreadcrumb({
        category: 'registration-edit',
        message: 'Client-submitted total overridden by server-recomputed canonical price',
        level: 'info',
        data: { participantId, eventId: row.eventId, clientTotal, canonicalTotal: canonical.total, recomputePrice: !!opts.recomputePrice },
      });
    }
    totalPrice = String(canonical.total);
    priceBreakdown = canonical.priceBreakdownJson;
  }
  const newTotal = parseFloat(totalPrice || '0');

  const updated: Record<string, string> = {
    ...row,
    name: data.name || row.name,
    phone: data.phone || row.phone,
    registeredAdults: String(data.adults || 0),
    registeredKids: String(data.kids || 0),
    totalPrice,
    priceBreakdown,
    selectedActivities,
    customFields: data.customFields || '',
    attendeeNames: data.attendeeNames ?? row.attendeeNames ?? '',
    updatedAt: now,
  };

  if (data.city !== undefined) updated.city = data.city;
  if (data.referredBy !== undefined) updated.referredBy = data.referredBy;

  // Payment handling: keep old payment if no new payment, update if new payment provided
  if (data.paymentStatus) {
    updated.paymentStatus = data.paymentStatus;
    updated.paymentMethod = data.paymentMethod || '';
    updated.transactionId = data.transactionId || '';

    // If registration was on hold (due to Zelle) and now has a confirmed payment, change status to confirmed
    const wasOnHold = row.registrationStatus === 'on_hold';
    const isConfirmedPayment = data.paymentStatus === 'paid' && data.paymentMethod !== 'zelle';
    if (wasOnHold && isConfirmedPayment) {
      updated.registrationStatus = 'confirmed';
    }
  }

  await eventParticipantRepository.update(participantId, updated);

  await recordLedgerEntry({
    eventId: row.eventId,
    participantId,
    email: row.email,
    type: 'edited',
    snapshot: {
      adults: data.adults || 0,
      kids: data.kids || 0,
      totalPrice,
      registrationStatus: updated.registrationStatus,
      // Full before/after activity selections — the live participant row
      // only ever holds the current state, so this is the only place a
      // removed or changed performance (name, chest number) is preserved.
      selectedActivitiesBefore: row.selectedActivities || '',
      selectedActivitiesAfter: selectedActivities || '',
    },
  });

  // A new payment here is a *separate* provider capture (e.g. paying the
  // delta for an added performer) — recorded as its own charge entry rather
  // than overwriting transactionId, so a later refund can still find and
  // refund the original capture too, not just this most recent one.
  if (data.paymentStatus === 'paid' && newTotal > oldPaidAmount && data.transactionId) {
    const additionalAmount = newTotal - oldPaidAmount;
    await recordLedgerEntry({
      eventId: row.eventId,
      participantId,
      email: row.email,
      type: 'charge',
      amount: String(additionalAmount),
      method: data.paymentMethod || '',
      transactionId: data.transactionId,
      note: 'Additional payment from registration edit',
    });
    await createIncomeFromPayment({
      eventName: event.name,
      amount: String(additionalAmount),
      payerName: data.name || row.name,
      paymentMethod: data.paymentMethod,
      source: 'registration',
    });
  }

  // Refund the difference if the registration was already paid and the new
  // total is lower (only auto-refundable for PayPal/Square — see refunds.service.ts).
  // Admin-initiated edits never auto-refund — only self-service ones do.
  let refundOutcome: RegistrationRefundOutcome | undefined;
  if (row.paymentStatus === 'paid' && newTotal < oldPaidAmount) {
    const refundAmount = oldPaidAmount - newTotal;
    if (!opts.isAdminOrCommittee) {
      refundOutcome = await refundRegistrationPayment({
        participantId,
        eventId: row.eventId,
        eventName: event.name,
        participantName: data.name || row.name,
        participantEmail: row.email,
        amount: String(refundAmount),
        reason: `Registration updated: ${event.name}`,
        fallbackMethod: row.paymentMethod,
        fallbackTransactionId: row.transactionId,
        fallbackAmount: row.totalPrice,
      });
    } else {
      // Admin-initiated edits never auto-refund — alert the treasurer to
      // process it manually, and let the admin dashboard know so it can
      // prompt the admin to follow up directly with the treasurer too.
      const note = 'This edit lowered the total and requires a refund — the treasurer has been notified to process it manually.';
      await notifyTreasurer({
        reason: 'manual_refund_needed',
        eventId: row.eventId,
        eventName: event.name,
        participantId,
        participantName: data.name || row.name,
        participantEmail: row.email,
        amount: String(refundAmount),
        paymentMethod: row.paymentMethod,
        transactionId: row.transactionId,
        errorMessage: 'Admin-initiated edit lowered the total — refund not attempted automatically.',
      });
      refundOutcome = { status: 'manual', note };
    }
  }

  Sentry.addBreadcrumb({
    category: 'registration-edit',
    message: 'updateRegistration completed',
    level: 'info',
    data: { participantId, eventId: row.eventId, oldPaidAmount, newTotal, refundStatus: refundOutcome?.status ?? 'n/a' },
  });

  // Admin-initiated edits don't notify the participant — only self-service ones do.
  if (!opts.isAdminOrCommittee) {
    try {
      const history = await registrationLedgerRepository.findByParticipantId(participantId) as unknown as EmailLedgerEntry[];
      const { eventSponsors, generalSponsors } = await getPublicSponsors({ eventId: row.eventId, year: event.date?.slice(0, 4) });
      await sendEmail(
        [row.email],
        `Registration Updated: ${event.name}`,
        buildRegistrationLifecycleEmail({
          type: 'updated',
          eventName: event.name,
          eventDate: event.date,
          participantName: updated.name || row.name,
          adults: data.adults || 0,
          kids: data.kids || 0,
          registrationStatus: updated.registrationStatus,
          totalPrice: updated.totalPrice,
          priceBreakdownJson: updated.priceBreakdown || '',
          paymentMethod: updated.paymentMethod,
          selectedActivitiesJson: updated.selectedActivities,
          activities: parseActivities(event.activities || ''),
          additionalAmountCharged: newTotal > oldPaidAmount ? String(newTotal - oldPaidAmount) : undefined,
          refundStatus: refundOutcome?.status,
          refundNote: refundOutcome && 'note' in refundOutcome ? refundOutcome.note : undefined,
          refundedAmount: refundOutcome && 'refundedAmount' in refundOutcome ? refundOutcome.refundedAmount : undefined,
          history,
          eventHomeUrl: `${getAppUrl()}/events/${row.eventId}/home`,
          eventDescription: event.description || '',
          customEmailMessage: event.customEmailMessage ? formatCustomMessage(event.customEmailMessage) : '',
          eventSponsors,
          generalSponsors,
        }),
        'system',
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Registration updated confirmation email failed', participantId, eventId: row.eventId } });
    }
  }

  return { ...updated, refundOutcome } as Record<string, string> & { refundOutcome?: RegistrationRefundOutcome };
}

/**
 * Update payment info for a participant (admin action).
 */
export async function updateParticipantPayment(
  participantId: string,
  data: { paymentStatus: string; paymentMethod: string; totalPrice?: string },
) {
  const row = await eventParticipantRepository.findById(participantId);
  if (!row) throw new NotFoundError('Participant');

  const now = new Date().toISOString();
  const updated: Record<string, string> = {
    ...row,
    paymentStatus: data.paymentStatus,
    paymentMethod: data.paymentMethod,
    updatedAt: now,
  };
  if (data.totalPrice !== undefined) {
    updated.totalPrice = data.totalPrice;
  }

  await eventParticipantRepository.update(participantId, updated);

  // Create income record if marking as paid
  const amount = data.totalPrice || row.totalPrice || '0';
  if (data.paymentStatus === 'paid' && row.paymentStatus !== 'paid') {
    const event = await eventRepository.findById(row.eventId);
    if (event) {
      await createIncomeFromPayment({
        eventName: event.name,
        amount,
        payerName: row.name,
        paymentMethod: data.paymentMethod,
        source: 'checkin',
      });
    }
  }

  return updated;
}

/**
 * Search participants/members by name for an event.
 */
export async function search(eventId: string, query: string) {
  const q = query.toLowerCase().trim();

  const [participants, members] = await Promise.all([
    eventParticipantRepository.findByEventId(eventId),
    memberRepository.findAll(),
  ]);

  const results: { name: string; email: string; type: string; source: string }[] = [];
  const seen = new Set<string>();

  for (const p of participants) {
    if (p.name?.toLowerCase().includes(q)) {
      const key = p.email?.toLowerCase() || p.name?.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: p.name, email: p.email, type: p.type, source: p.registeredAt ? 'registration' : 'checkin' });
      }
    }
  }

  for (const member of members) {
    if (member.name?.toLowerCase().includes(q)) {
      const key = member.email?.toLowerCase() || member.name?.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: member.name, email: member.email, type: 'Member', source: 'member' });
      }
    }
  }

  return results.slice(0, 10);
}

/**
 * Update a member's profile fields (phone, address, spouse, children).
 * Uses the proper related-entity repositories (address, spouse, child tables).
 */
export async function updateMemberProfile(
  memberId: string,
  data: {
    phone?: string;
    address?: { street: string; street2?: string; city: string; state: string; zipCode: string; country?: string } | null;
    spouse?: { firstName: string; middleName?: string; lastName?: string; email?: string; phone?: string; nativePlace?: string; company?: string; college?: string; qualifyingDegree?: string } | null;
    children?: { name: string; age?: string; sex?: string; grade?: string; dateOfBirth?: string }[];
  },
) {
  const row = await memberRepository.findById(memberId);
  if (!row) return;

  const now = new Date().toISOString();

  // Update phone on member record if provided
  if (data.phone !== undefined) {
    await memberRepository.update(memberId, { phone: data.phone, updatedAt: now });
  }

  // Upsert address
  if (data.address !== undefined) {
    await memberAddressRepository.deleteByMemberId(memberId);
    const addr = data.address;
    if (addr && Object.values(addr).some(v => String(v || '').trim())) {
      await memberAddressRepository.create({
        memberId,
        street: addr.street || '',
        street2: addr.street2 || '',
        city: addr.city || '',
        state: addr.state || '',
        zipCode: addr.zipCode || '',
        country: addr.country || '',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Upsert spouse
  if (data.spouse !== undefined) {
    await memberSpouseRepository.deleteByMemberId(memberId);
    const sp = data.spouse;
    if (sp && Object.values(sp).some(v => String(v || '').trim())) {
      await memberSpouseRepository.create({
        memberId,
        firstName: sp.firstName || '',
        middleName: sp.middleName || '',
        lastName: sp.lastName || '',
        email: sp.email || '',
        phone: sp.phone || '',
        nativePlace: sp.nativePlace || '',
        company: sp.company || '',
        college: sp.college || '',
        qualifyingDegree: sp.qualifyingDegree || '',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Replace children
  if (data.children !== undefined) {
    await memberChildRepository.deleteByMemberId(memberId);
    const kids = (data.children || []).filter(c => c.name?.trim());
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      await memberChildRepository.create({
        memberId,
        name: child.name || '',
        age: child.age || '',
        sex: child.sex || '',
        grade: child.grade || '',
        dateOfBirth: child.dateOfBirth || '',
        sortOrder: i + 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}
