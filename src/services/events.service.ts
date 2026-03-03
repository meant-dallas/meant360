import { generateId } from '@/lib/utils';
import { createCrudService, NotFoundError } from './crud.service';
import { parseGuestPolicy } from '@/lib/event-config';
import {
  eventRepository,
  eventParticipantRepository,
  memberRepository,
  guestRepository,
  incomeRepository,
  expenseRepository,
} from '@/repositories';

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

  const { id, name, date, description, status, pricingRules,
    formConfig, activities, activityPricingMode, guestPolicy, registrationOpen } = existing;

  const [participants, allEvents] = await Promise.all([
    eventParticipantRepository.findByEventId(eventId),
    eventRepository.findAll(),
  ]);

  const registrations = participants.filter((p) => p.registeredAt);
  const checkins = participants.filter((p) => p.checkedInAt);

  // Safe parser: clamp to 0–99 to guard against column-misalignment / bad data
  const safeCount = (v: string | undefined) => {
    const n = parseInt(v || '0', 10);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : 0;
  };

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'Upcoming' && e.id !== id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 5)
    .map((e) => ({ id: e.id, name: e.name, date: e.date }));

  return {
    id, name, date, description, status,
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
        address: member.address || '',
        spouseName: member.spouseName || '',
        spouseEmail: member.spouseEmail || '',
        spousePhone: member.spousePhone || '',
        children: member.children || '',
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
        address: member.address || '',
        spouseName: member.spouseName || '',
        spouseEmail: member.spouseEmail || '',
        spousePhone: member.spousePhone || '',
        children: member.children || '',
        memberStatus: member.status,

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

    return { ...updated, checkedInAt: now };
  }

  // Walk-in: no prior registration — create new row
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
 */
export async function updateMemberProfile(
  memberId: string,
  data: {
    phone?: string;
    address?: string;
    spouseName?: string;
    spouseEmail?: string;
    spousePhone?: string;
    children?: string;
  },
) {
  const row = await memberRepository.findById(memberId);
  if (!row) return;

  const now = new Date().toISOString();
  const updated: Record<string, string> = { ...row, updatedAt: now };
  if (data.phone !== undefined) updated.phone = data.phone;
  if (data.address !== undefined) updated.address = data.address;
  if (data.spouseName !== undefined) updated.spouseName = data.spouseName;
  if (data.spouseEmail !== undefined) updated.spouseEmail = data.spouseEmail;
  if (data.spousePhone !== undefined) updated.spousePhone = data.spousePhone;
  if (data.children !== undefined) updated.children = data.children;

  await memberRepository.update(memberId, updated);
}
