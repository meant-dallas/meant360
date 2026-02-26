import { getRows, appendRow, getRowById, updateRow } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';
import { SHEET_TABS } from '@/types';
import { createCrudService, NotFoundError } from './crud.service';
import { maskEmail, maskPhone } from '@/lib/security';

// ========================================
// Event Services
// ========================================

export const eventService = createCrudService({
  sheetName: SHEET_TABS.EVENTS,
  entityName: 'Event',
  buildCreateRecord: (data) => ({
    name: String(data.name || ''),
    date: String(data.date || ''),
    description: String(data.description || ''),
    status: String(data.status || 'Upcoming'),
    parentEventId: String(data.parentEventId || ''),
    pricingRules: String(data.pricingRules || ''),
  }),
});

/**
 * Get public event detail with stats, sub-events, siblings, upcoming events.
 */
export async function getPublicDetail(eventId: string) {
  const existing = await getRowById(SHEET_TABS.EVENTS, eventId);
  if (!existing) throw new NotFoundError('Event');

  const { id, name, date, description, status, parentEventId, pricingRules } = existing.record;

  const [registrations, checkins, allEvents] = await Promise.all([
    getRows(SHEET_TABS.EVENT_REGISTRATIONS),
    getRows(SHEET_TABS.EVENT_CHECKINS),
    getRows(SHEET_TABS.EVENTS),
  ]);

  const eventRegs = registrations.filter((r) => r.eventId === eventId);
  const eventCheckins = checkins.filter((c) => c.eventId === eventId);

  // Safe parser: clamp to 0–99 to guard against column-misalignment / bad data
  const safeCount = (v: string | undefined) => {
    const n = parseInt(v || '0', 10);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : 0;
  };

  const subEvents = allEvents
    .filter((e) => e.parentEventId === id)
    .map((e) => ({ id: e.id, name: e.name, date: e.date, status: e.status, pricingRules: e.pricingRules || '' }));

  const siblingEvents = parentEventId
    ? allEvents
        .filter((e) => e.parentEventId === parentEventId && e.id !== id)
        .map((e) => ({ id: e.id, name: e.name, date: e.date, status: e.status, pricingRules: e.pricingRules || '' }))
    : [];

  const parentEvent = parentEventId
    ? allEvents.find((e) => e.id === parentEventId)
    : null;

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'Upcoming' && e.id !== id && !e.parentEventId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 5)
    .map((e) => ({ id: e.id, name: e.name, date: e.date }));

  return {
    id, name, date, description, status,
    parentEventId: parentEventId || '',
    parentEventName: parentEvent?.name || '',
    pricingRules: pricingRules || '',
    totalRegistrations: eventRegs.length,
    totalCheckins: eventCheckins.length,
    // Headcount per type (adults + kids)
    memberCheckinAttendees: eventCheckins.filter((c) => c.type === 'Member').reduce((sum, c) => sum + safeCount(c.adults) + safeCount(c.kids), 0),
    guestCheckinAttendees: eventCheckins.filter((c) => c.type === 'Guest').reduce((sum, c) => sum + safeCount(c.adults) + safeCount(c.kids), 0),
    memberRegAttendees: eventRegs.filter((r) => r.type === 'Member').reduce((sum, r) => sum + safeCount(r.adults) + safeCount(r.kids), 0),
    guestRegAttendees: eventRegs.filter((r) => r.type === 'Guest').reduce((sum, r) => sum + safeCount(r.adults) + safeCount(r.kids), 0),
    subEvents,
    siblingEvents,
    upcomingEvents,
  };
}

/**
 * Get event statistics (auth-required).
 */
export async function getStats(eventId: string) {
  const event = await getRowById(SHEET_TABS.EVENTS, eventId);
  if (!event) throw new NotFoundError('Event');

  const [allRegistrations, allCheckins] = await Promise.all([
    getRows(SHEET_TABS.EVENT_REGISTRATIONS),
    getRows(SHEET_TABS.EVENT_CHECKINS),
  ]);

  const registrations = allRegistrations.filter((r) => r.eventId === eventId);
  const checkins = allCheckins.filter((c) => c.eventId === eventId);

  return {
    event: event.record,
    totalRegistrations: registrations.length,
    totalCheckins: checkins.length,
    memberCheckins: checkins.filter((c) => c.type === 'Member').length,
    guestCheckins: checkins.filter((c) => c.type === 'Guest').length,
    registrations,
    checkins,
  };
}

/**
 * Lookup member/guest by email for registration/checkin.
 */
export async function lookup(eventId: string, email: string) {
  const emailLower = email.toLowerCase().trim();

  const eventRow = await getRows(SHEET_TABS.EVENTS);
  const thisEvent = eventRow.find((e) => e.id === eventId);
  const parentEventId = thisEvent?.parentEventId || '';

  // Check if already checked in
  const checkins = await getRows(SHEET_TABS.EVENT_CHECKINS);
  const existingCheckin = checkins.find(
    (c) => c.eventId === eventId && c.email?.toLowerCase().trim() === emailLower,
  );
  if (existingCheckin) {
    return {
      status: 'already_checked_in',
      name: existingCheckin.name,
      checkedInAt: existingCheckin.checkedInAt,
    };
  }

  // Check members
  const members = await getRows(SHEET_TABS.MEMBERS);
  const member = members.find(
    (m) =>
      m.email?.toLowerCase().trim() === emailLower ||
      m.spouseEmail?.toLowerCase().trim() === emailLower,
  );

  // Count sibling event registrations
  let siblingEventRegCount = 0;
  if (parentEventId) {
    const siblingEventIds = eventRow
      .filter((e) => e.parentEventId === parentEventId && e.id !== eventId)
      .map((e) => e.id);
    if (siblingEventIds.length > 0) {
      const registrations = await getRows(SHEET_TABS.EVENT_REGISTRATIONS);
      siblingEventRegCount = registrations.filter(
        (r) => siblingEventIds.includes(r.eventId) && r.email?.toLowerCase().trim() === emailLower,
      ).length;
    }
  }

  if (member) {
    if (member.status === 'Active') {
      const profileComplete = !!member.address?.trim();
      const missingFields: string[] = [];
      if (!profileComplete) missingFields.push('address');

      return {
        status: 'member_active',
        memberId: member.id,
        name: member.name,
        email: maskEmail(member.email),
        phone: maskPhone(member.phone),
        profileComplete,
        missingFields,
        siblingEventRegCount,
      };
    } else {
      return {
        status: 'member_expired',
        memberId: member.id,
        name: member.name,
        memberStatus: member.status,
        siblingEventRegCount,
      };
    }
  }

  // Check guests
  const guests = await getRows(SHEET_TABS.GUESTS);
  const guest = guests.find(
    (g) => g.email?.toLowerCase().trim() === emailLower,
  );

  if (guest) {
    return {
      status: 'returning_guest',
      guestId: guest.id,
      name: guest.name,
      email: maskEmail(guest.email),
      phone: maskPhone(guest.phone),
      city: guest.city,
      referredBy: guest.referredBy,
      siblingEventRegCount,
    };
  }

  return { status: 'not_found', siblingEventRegCount };
}

/**
 * Find or create a Guest record by email.
 */
async function findOrCreateGuest(
  emailLower: string,
  data: { name: string; phone: string; city: string; referredBy: string },
  incrementAttended: boolean,
): Promise<string> {
  const guests = await getRows(SHEET_TABS.GUESTS);
  const existingGuest = guests.find(
    (g) => g.email?.toLowerCase().trim() === emailLower,
  );
  const now = new Date().toISOString();

  if (existingGuest) {
    if (incrementAttended) {
      const guestRow = await getRowById(SHEET_TABS.GUESTS, existingGuest.id);
      if (guestRow) {
        const attended = parseInt(guestRow.record.eventsAttended || '0', 10) + 1;
        await updateRow(SHEET_TABS.GUESTS, guestRow.rowIndex, {
          ...guestRow.record,
          eventsAttended: attended,
          lastEventDate: now.split('T')[0],
          updatedAt: now,
        });
      }
    }
    return existingGuest.id;
  }

  const guestId = generateId();
  await appendRow(SHEET_TABS.GUESTS, {
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
 * Register for an event. Public endpoint.
 */
export async function register(
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
    city?: string;
    referredBy?: string;
  },
) {
  const event = await getRowById(SHEET_TABS.EVENTS, eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.record.status !== 'Upcoming') {
    throw new Error('Event is not open for registration');
  }

  const emailLower = data.email.toLowerCase().trim();

  // Prevent duplicate registration
  const registrations = await getRows(SHEET_TABS.EVENT_REGISTRATIONS);
  const existing = registrations.find(
    (r) => r.eventId === eventId && r.email?.toLowerCase().trim() === emailLower,
  );
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
    adults: data.adults || 0,
    kids: data.kids || 0,
    registeredAt: now,
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    paymentStatus: data.paymentStatus || '',
    paymentMethod: data.paymentMethod || '',
    transactionId: data.transactionId || '',
  };

  await appendRow(SHEET_TABS.EVENT_REGISTRATIONS, record);
  return record;
}

/**
 * Check in to an event. Public endpoint.
 */
export async function checkin(
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
    city?: string;
    referredBy?: string;
  },
) {
  const event = await getRowById(SHEET_TABS.EVENTS, eventId);
  if (!event) throw new NotFoundError('Event');
  if (event.record.status === 'Cancelled') {
    throw new Error('Event is cancelled');
  }

  const emailLower = data.email.toLowerCase().trim();

  // Duplicate prevention — return flag
  const checkins = await getRows(SHEET_TABS.EVENT_CHECKINS);
  const existingCheckin = checkins.find(
    (c) => c.eventId === eventId && c.email?.toLowerCase().trim() === emailLower,
  );
  if (existingCheckin) {
    return { alreadyCheckedIn: true, checkedInAt: existingCheckin.checkedInAt };
  }

  const now = new Date().toISOString();
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
    adults: data.adults || 0,
    kids: data.kids || 0,
    checkedInAt: now,
    totalPrice: data.totalPrice || '0',
    priceBreakdown: data.priceBreakdown || '',
    paymentStatus: data.paymentStatus || '',
    paymentMethod: data.paymentMethod || '',
    transactionId: data.transactionId || '',
  };

  await appendRow(SHEET_TABS.EVENT_CHECKINS, record);
  return record;
}

/**
 * Search registrations/members by name for an event.
 */
export async function search(eventId: string, query: string) {
  const q = query.toLowerCase().trim();

  const [registrations, members] = await Promise.all([
    getRows(SHEET_TABS.EVENT_REGISTRATIONS),
    getRows(SHEET_TABS.MEMBERS),
  ]);

  const results: { name: string; email: string; type: string; source: string }[] = [];
  const seen = new Set<string>();

  const eventRegs = registrations.filter((r) => r.eventId === eventId);
  for (const reg of eventRegs) {
    if (reg.name?.toLowerCase().includes(q)) {
      const key = reg.email?.toLowerCase() || reg.name?.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: reg.name, email: reg.email, type: reg.type, source: 'registration' });
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
