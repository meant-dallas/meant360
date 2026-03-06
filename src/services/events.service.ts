import { generateId } from '@/lib/utils';
import { createCrudService, NotFoundError } from './crud.service';
import { parseGuestPolicy } from '@/lib/event-config';
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
} from '@/repositories';
import { sendEmail } from './email.service';

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

function buildEventEmailHtml(opts: {
  type: 'registration' | 'checkin';
  participantName: string;
  eventName: string;
  eventDate: string;
  eventDescription?: string;
  eventCategory?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice?: string;
  paymentMethod?: string;
  participantType?: string;
}): string {
  const isRegistration = opts.type === 'registration';
  const title = isRegistration ? 'Registration Confirmed!' : 'Check-in Confirmed!';
  const subtitle = isRegistration
    ? `You have been successfully registered for <strong>${opts.eventName}</strong>.`
    : `You have been successfully checked in to <strong>${opts.eventName}</strong>.`;
  const headerGradient = isRegistration
    ? 'linear-gradient(135deg,#1e40af,#2563eb)'
    : 'linear-gradient(135deg,#059669,#10b981)';
  const accentColor = isRegistration ? '#2563eb' : '#10b981';
  const accentLight = isRegistration ? '#eff6ff' : '#ecfdf5';
  const accentBorder = isRegistration ? '#93c5fd' : '#6ee7b7';

  const logoSrc = opts.logoUrl || `${getAppUrl()}/logo.png`;

  // Format date nicely
  let formattedDate = opts.eventDate || 'TBD';
  try {
    if (opts.eventDate) {
      const d = new Date(opts.eventDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });
      }
    }
  } catch { /* keep raw */ }

  const thStyle = 'text-align:left;padding:10px 14px;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;';
  const tdStyle = 'padding:10px 14px;color:#1e293b;font-size:13px;font-weight:500;vertical-align:top;';
  const rowEven = 'background-color:#f8fafc;';

  // Build detail rows
  const rows: [string, string][] = [
    ['Event', opts.eventName],
    ['Date', formattedDate],
  ];
  if (opts.eventCategory) rows.push(['Category', opts.eventCategory]);
  if (opts.participantType) rows.push(['Registration Type', opts.participantType]);
  rows.push(['Adults', String(opts.adults)]);
  rows.push(['Kids', String(opts.kids)]);
  if (isRegistration && opts.totalPrice && opts.totalPrice !== '0') {
    rows.push(['Amount', `$${opts.totalPrice}`]);
  }
  if (opts.paymentMethod) rows.push(['Payment Method', opts.paymentMethod]);

  const detailRowsHtml = rows.map(([label, value], i) =>
    `<tr style="${i % 2 === 0 ? rowEven : ''}"><td style="${thStyle}">${label}</td><td style="${tdStyle}">${value}</td></tr>`
  ).join('');

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#f1f5f9;padding:20px;">
      <!-- Header -->
      <div style="background:${headerGradient};border-radius:14px 14px 0 0;padding:32px 24px;text-align:center;">
        <img src="${logoSrc}" alt="${opts.eventName}" width="72" height="72" style="border-radius:14px;margin-bottom:14px;border:3px solid rgba(255,255,255,0.3);" />
        <h1 style="color:#ffffff;font-size:22px;margin:0 0 6px;">${opts.eventName}</h1>
        ${opts.eventDescription ? `<p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;line-height:1.5;">${opts.eventDescription}</p>` : ''}
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:32px 24px;">
        <!-- Confirmation Badge -->
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:${accentLight};border:1px solid ${accentBorder};border-radius:50px;padding:10px 28px;">
            <span style="font-size:16px;font-weight:700;color:${accentColor};">
              ${isRegistration ? '🎫' : '✅'} ${title}
            </span>
          </div>
        </div>

        <!-- Greeting -->
        <p style="font-size:15px;color:#1e293b;margin:0 0 8px;">Hi <strong>${opts.participantName}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 24px;">${subtitle}</p>

        <!-- Event Details Card -->
        <div style="background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:24px;">
          <div style="background:${accentLight};padding:12px 16px;border-bottom:1px solid ${accentBorder};">
            <h3 style="margin:0;font-size:13px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;">
              ${isRegistration ? '📋 Registration Details' : '📋 Check-in Details'}
            </h3>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${detailRowsHtml}
          </table>
        </div>

        ${isRegistration ? `
        <!-- We look forward -->
        <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.5;text-align:center;font-weight:600;">
            🎉 We look forward to seeing you there!
          </p>
        </div>
        ` : `
        <!-- Enjoy -->
        <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <h3 style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">🎉 You're all set!</h3>
          <p style="margin:0;font-size:13px;color:#064e3b;line-height:1.5;">
            Enjoy the event! We're glad to have you here.
          </p>
        </div>
        `}

        <!-- Footer -->
        <div style="text-align:center;padding-top:20px;border-top:1px solid #e2e8f0;">
          <p style="font-size:13px;color:#64748b;margin:0 0 4px;">
            ${isRegistration ? 'We look forward to seeing you there!' : 'Thank you for attending!'}
          </p>
          <p style="font-size:12px;color:#94a3b8;margin:0;">
            &copy; ${new Date().getFullYear()} MEANT (Malayalee Engineers' Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  `;
}

function buildRegistrationConfirmationEmail(opts: {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventDescription?: string;
  eventCategory?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice: string;
  paymentMethod?: string;
  participantType?: string;
}): string {
  return buildEventEmailHtml({ ...opts, type: 'registration' });
}

function buildCheckinConfirmationEmail(opts: {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventDescription?: string;
  eventCategory?: string;
  logoUrl?: string;
  adults: number;
  kids: number;
  totalPrice?: string;
  paymentMethod?: string;
  participantType?: string;
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
      const d = new Date(opts.eventDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
}) {
  const total = parseFloat(opts.amount || '0');
  if (total <= 0) return;

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const currentYear = String(new Date().getFullYear());

  // Update member: status → Active, renewalDate, append year
  const memberRecord = await memberRepository.findById(opts.memberId);
  if (memberRecord) {
    const existingYears = (memberRecord.membershipYears || '')
      .split(',').map((y: string) => y.trim()).filter(Boolean);
    if (!existingYears.includes(currentYear)) existingYears.push(currentYear);
    await memberRepository.update(opts.memberId, {
      ...memberRecord,
      status: 'Active',
      renewalDate: today,
      membershipYears: existingYears.join(','),
      updatedAt: now,
    });
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
    notes: 'Membership renewal during event registration',
    createdAt: now,
    updatedAt: now,
  });
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
  }),
});

/**
 * Get public event detail with stats, sub-events, siblings, upcoming events.
 */
export async function getPublicDetail(eventId: string) {
  const existing = await eventRepository.findById(eventId);
  if (!existing) throw new NotFoundError('Event');

  const { id, name, date, description, status, category, pricingRules,
    formConfig, activities, activityPricingMode, guestPolicy, registrationOpen } = existing;

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

  const registrations = participants.filter((p) => p.registeredAt);
  const checkins = participants.filter((p) => p.checkedInAt);

  // Safe parser: clamp to 0–99 to guard against column-misalignment / bad data
  const safeCount = (v: string | undefined) => {
    const n = parseInt(v || '0', 10);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : 0;
  };

  // Build category → logoUrl map from settings
  const categoryLogoMap = new Map<string, string>();
  try {
    const cats: { name: string; email: string; logoUrl?: string }[] = JSON.parse(settings['email_categories'] || '[]');
    for (const c of cats) {
      if (c.logoUrl) categoryLogoMap.set(c.name.toLowerCase().trim(), c.logoUrl);
    }
  } catch { /* ignore */ }

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'Upcoming' && e.id !== id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      categoryLogoUrl: categoryLogoMap.get((e.category || '').toLowerCase().trim()) || '',
    }));

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
    totalRegistrations: registrations.length,
    totalCheckins: checkins.length,
    memberCheckinAttendees: checkins.filter((c) => c.type === 'Member').reduce((sum, c) => sum + safeCount(c.actualAdults) + safeCount(c.actualKids), 0),
    guestCheckinAttendees: checkins.filter((c) => c.type === 'Guest').reduce((sum, c) => sum + safeCount(c.actualAdults) + safeCount(c.actualKids), 0),
    memberRegAttendees: registrations.filter((r) => r.type === 'Member').reduce((sum, r) => sum + safeCount(r.registeredAdults) + safeCount(r.registeredKids), 0),
    guestRegAttendees: registrations.filter((r) => r.type === 'Guest').reduce((sum, r) => sum + safeCount(r.registeredAdults) + safeCount(r.registeredKids), 0),
    upcomingEvents,
  };
}

/**
 * Get event statistics (auth-required).
 */
export async function getStats(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');

  const eventParticipants = await eventParticipantRepository.findByEventId(eventId);

  const registrations = eventParticipants.filter((p) => p.registeredAt);
  const checkins = eventParticipants.filter((p) => p.checkedInAt);
  const walkIns = eventParticipants.filter((p) => p.checkedInAt && !p.registeredAt);
  const noShows = eventParticipants.filter((p) => p.registeredAt && !p.checkedInAt);

  // Fetch expenses for this event (linked by eventName)
  const allExpenses = await expenseRepository.findAll();
  const eventExpenses = allExpenses.filter((e) => e.eventName === event.name);
  const totalExpenses = eventExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);

  return {
    event,
    totalRegistrations: registrations.length,
    totalCheckins: checkins.length,
    memberCheckins: checkins.filter((c) => c.type === 'Member').length,
    guestCheckins: checkins.filter((c) => c.type === 'Guest').length,
    walkIns: walkIns.length,
    noShows: noShows.length,
    participants: eventParticipants,
    totalExpenses,
  };
}

/**
 * Lookup member/guest by email for registration/checkin.
 */
export async function lookup(eventId: string, email: string) {
  const emailLower = email.toLowerCase().trim();

  const [allEvents, allParticipants, members, guests] = await Promise.all([
    eventRepository.findAll(),
    eventParticipantRepository.findByEventId(eventId),
    memberRepository.findAll(),
    guestRepository.findAll(),
  ]);

  const thisEvent = allEvents.find((e) => e.id === eventId);
  const guestPolicy = parseGuestPolicy(thisEvent?.guestPolicy || '');

  // Check existing participation for this event
  const existingParticipant = allParticipants.find(
    (p) => p.email?.toLowerCase().trim() === emailLower,
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
        m.email?.toLowerCase().trim() === emailLower ||
        m.spouseEmail?.toLowerCase().trim() === emailLower,
    );
    if (member) {
      const memberEmail = member.email?.toLowerCase().trim() || '';
      const spouseEmail = member.spouseEmail?.toLowerCase().trim() || '';
      const otherEmail = memberEmail === emailLower ? spouseEmail : memberEmail;
      if (otherEmail) {
        const spouseParticipant = allParticipants.find(
          (p) => p.email?.toLowerCase().trim() === otherEmail,
        );
        if (spouseParticipant) {
          const spouseName = memberEmail === emailLower
            ? (member.spouseName || 'Spouse')
            : (member.name || 'Member');
          return {
            status: 'already_registered_spouse',
            name: spouseName,
            spouseEmail: otherEmail,
            checkedInAt: spouseParticipant.checkedInAt || '',
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
    };
  }

  // Check members
  const member = members.find(
    (m) =>
      m.email?.toLowerCase().trim() === emailLower ||
      m.spouseEmail?.toLowerCase().trim() === emailLower,
  );

  if (member) {
    if (member.status === 'Active') {
      const profileComplete = !!member.address?.trim();
      const missingFields: string[] = [];
      if (!profileComplete) missingFields.push('address');

      return {
        status: 'member_active',
        memberId: member.id,
        name: member.name,
        email: member.email || '',
        phone: member.phone || '',
        homePhone: member.homePhone || '',
        cellPhone: member.cellPhone || '',
        address: member.address || '',
        qualifyingDegree: member.qualifyingDegree || '',
        nativePlace: member.nativePlace || '',
        college: member.college || '',
        jobTitle: member.jobTitle || '',
        employer: member.employer || '',
        specialInterests: member.specialInterests || '',
        spouseName: member.spouseName || '',
        spouseEmail: member.spouseEmail || '',
        spousePhone: member.spousePhone || '',
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
        name: member.name,
        email: member.email || '',
        phone: member.phone || '',
        homePhone: member.homePhone || '',
        cellPhone: member.cellPhone || '',
        address: member.address || '',
        qualifyingDegree: member.qualifyingDegree || '',
        nativePlace: member.nativePlace || '',
        college: member.college || '',
        jobTitle: member.jobTitle || '',
        employer: member.employer || '',
        specialInterests: member.specialInterests || '',
        spouseName: member.spouseName || '',
        spouseEmail: member.spouseEmail || '',
        spousePhone: member.spousePhone || '',
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
    (g) => g.email?.toLowerCase().trim() === emailLower,
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
  if (existing) {
    const otherName = memberEmail === emailLower
      ? (member.spouseName || 'Spouse')
      : (member.name || 'Member');
    return { spouseName: otherName, spouseEmail: otherEmail };
  }
  return null;
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

  // Prevent duplicate registration
  const existing = await eventParticipantRepository.findByEventIdAndEmail(eventId, emailLower);
  if (existing) {
    throw new Error('Already registered for this event');
  }

  // Prevent spouse duplicate — if the other email on the same membership already registered
  const spouseMatch = await findSpouseParticipation(eventId, emailLower);
  if (spouseMatch) {
    throw new Error(`Already registered under ${spouseMatch.spouseName} (${spouseMatch.spouseEmail})`);
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
    selectedActivities: data.selectedActivities || '',
    customFields: data.customFields || '',
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    paymentStatus: data.paymentStatus || '',
    paymentMethod: data.paymentMethod || '',
    transactionId: data.transactionId || '',
  };

  await eventParticipantRepository.create(record);

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

  // Fire-and-forget: registration confirmation email to participant
  getCategoryLogoUrl(event.category || '').then((logoUrl) => {
    sendEmail(
      [emailLower],
      `Registration Confirmed: ${event.name}`,
      buildRegistrationConfirmationEmail({
        participantName: data.name,
        eventName: event.name,
        eventDate: event.date,
        eventDescription: event.description || '',
        eventCategory: event.category || '',
        logoUrl,
        adults: data.adults,
        kids: data.kids,
        totalPrice: data.totalPrice || '0',
        paymentMethod: data.paymentMethod || '',
        participantType: data.type,
      }),
      'system',
    ).catch((err) => console.error('Registration confirmation email failed:', err));
  }).catch((err) => console.error('Registration confirmation email failed:', err));

  // Fire-and-forget: alert category contact about new registration
  if (event.category) {
    Promise.all([
      getCategoryEmail(event.category),
      getCategoryLogoUrl(event.category),
    ]).then(([catEmail, logoUrl]) => {
      if (catEmail) {
        sendEmail(
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
        ).catch((err) => console.error('Category alert email failed:', err));
      }
    }).catch((err) => console.error('Category email lookup failed:', err));
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
  },
) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.status === 'Cancelled') {
    throw new Error('Event is cancelled');
  }

  const emailLower = data.email.toLowerCase().trim();
  const now = new Date().toISOString();

  // Guest policy enforcement for walk-ins
  if (data.type === 'Guest') {
    const guestPolicy = parseGuestPolicy(event.guestPolicy || '');
    if (!guestPolicy.allowGuests || guestPolicy.guestAction === 'blocked') {
      throw new Error(guestPolicy.guestMessage || 'Guest check-in is not allowed for this event');
    }
  }

  // Check for existing participant row (pre-registered or already checked in)
  const existing = await eventParticipantRepository.findByEventIdAndEmail(eventId, emailLower);

  if (existing) {
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

    // Fire-and-forget: check-in confirmation email
    getCategoryLogoUrl(event.category || '').then((logoUrl) => {
      sendEmail(
        [emailLower],
        `Check-in Confirmed: ${event.name}`,
        buildCheckinConfirmationEmail({
          participantName: data.name,
          eventName: event.name,
          eventDate: event.date,
          eventDescription: event.description || '',
          eventCategory: event.category || '',
          logoUrl,
          adults: data.adults,
          kids: data.kids,
        }),
        'system',
      ).catch((err) => console.error('Check-in confirmation email failed:', err));
    }).catch((err) => console.error('Check-in confirmation email failed:', err));

    return { ...updated, checkedInAt: now };
  }

  // Walk-in: no prior registration — check spouse duplicate first
  const spouseMatch = await findSpouseParticipation(eventId, emailLower);
  if (spouseMatch) {
    throw new Error(`Already registered under ${spouseMatch.spouseName} (${spouseMatch.spouseEmail})`);
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

  // Fire-and-forget: check-in confirmation email
  getCategoryLogoUrl(event.category || '').then((logoUrl) => {
    sendEmail(
      [emailLower],
      `Check-in Confirmed: ${event.name}`,
      buildCheckinConfirmationEmail({
        participantName: data.name,
        eventName: event.name,
        eventDate: event.date,
        eventDescription: event.description || '',
        eventCategory: event.category || '',
        logoUrl,
        adults: data.adults,
        kids: data.kids,
      }),
      'system',
    ).catch((err) => console.error('Check-in confirmation email failed:', err));
  }).catch((err) => console.error('Check-in confirmation email failed:', err));

  return record;
}

/**
 * Update an existing registration (e.g. change attendee count).
 * No refund if new total is lower. Collects additional payment if higher.
 */
export async function updateRegistration(
  participantId: string,
  data: {
    name: string;
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
  },
) {
  const row = await eventParticipantRepository.findById(participantId);
  if (!row) throw new NotFoundError('Participant');

  const now = new Date().toISOString();
  const oldPaidAmount = row.paymentStatus === 'paid'
    ? parseFloat(row.totalPrice || '0')
    : 0;
  const newTotal = parseFloat(data.totalPrice || '0');

  const updated: Record<string, string> = {
    ...row,
    name: data.name || row.name,
    phone: data.phone || row.phone,
    registeredAdults: String(data.adults || 0),
    registeredKids: String(data.kids || 0),
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    selectedActivities: data.selectedActivities || '',
    customFields: data.customFields || '',
    updatedAt: now,
  };

  if (data.city !== undefined) updated.city = data.city;
  if (data.referredBy !== undefined) updated.referredBy = data.referredBy;

  // Payment handling: keep old payment if no new payment, update if new payment provided
  if (data.paymentStatus) {
    updated.paymentStatus = data.paymentStatus;
    updated.paymentMethod = data.paymentMethod || '';
    updated.transactionId = data.transactionId || '';
  }

  await eventParticipantRepository.update(participantId, updated);

  // Create income record for the additional amount if new payment was made
  if (data.paymentStatus === 'paid' && newTotal > oldPaidAmount) {
    const additionalAmount = newTotal - oldPaidAmount;
    const event = await eventRepository.findById(row.eventId);
    if (event) {
      await createIncomeFromPayment({
        eventName: event.name,
        amount: String(additionalAmount),
        payerName: data.name || row.name,
        paymentMethod: data.paymentMethod,
        source: 'registration',
      });
    }
  }

  return updated;
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
