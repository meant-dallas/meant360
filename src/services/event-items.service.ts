import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { parseAmount } from '@/lib/utils';
import { logActivity } from '@/lib/audit-log';
import { parseItemCatalog, parseFormConfig, resolveRegistrationFeatures, registrantTypeLabel } from '@/lib/event-config';
import { calculateItemsPrice, type ItemPriceInput } from '@/lib/pricing';
import type { ItemConfig } from '@/types';
import { eventRepository, eventItemRegistrationRepository, eventRegistrationParticipantRepository, eventRegistrationItemSelectionRepository, registrationLedgerRepository, settingRepository, memberSpouseRepository, memberChildRepository } from '@/repositories';
import { NotFoundError } from './crud.service';
import { recordAttendance } from './engagement.service';
import { refundRegistrationPayment, type RefundOutcome } from './refunds.service';
import { resolveCategoryBranding, buildUpcomingEventsList } from './events.service';

export class ItemSoldOutError extends Error {
  constructor(itemName: string) {
    super(`"${itemName}" just sold out — please remove it or pick something else.`);
    this.name = 'ItemSoldOutError';
  }
}

export class GuestsNotAllowedError extends Error {
  constructor() {
    super('This event is open to verified members only.');
    this.name = 'GuestsNotAllowedError';
  }
}

export class SelfServiceEditDisabledError extends Error {
  constructor() {
    super('Self-service editing is not enabled for this event.');
    this.name = 'SelfServiceEditDisabledError';
  }
}

export class RegistrationCancelledError extends Error {
  constructor() {
    super('This registration has been cancelled.');
    this.name = 'RegistrationCancelledError';
  }
}

async function requireItemsEvent(eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event || event.registrationModel !== 'items') throw new NotFoundError('Event');
  return event;
}

// ========================================
// Public catalog (registration/home pages)
// ========================================

export async function getItemsEventPublicDetail(eventId: string) {
  const event = await requireItemsEvent(eventId);
  const catalog = parseItemCatalog(event.items);
  const formConfig = parseFormConfig(event.formConfig);
  const registrationFeatures = resolveRegistrationFeatures(event);

  const items = await Promise.all(
    catalog.items.map(async (item) => {
      let remainingCapacity: number | null = null;
      if (item.capacity) {
        const active = await eventRegistrationItemSelectionRepository.findActiveByItemId(item.id);
        const used = active.reduce((sum, s) => sum + (parseInt(s.quantity || '0', 10) || 0), 0);
        remainingCapacity = Math.max(0, item.capacity - used);
      }
      return { ...item, remainingCapacity };
    }),
  );

  // Same category → logo/bgColor resolution legacy's getPublicDetail uses,
  // so the shared PublicLayout header renders identically for both models.
  const settings = await settingRepository.getAll();
  const { categoryLogoUrl, categoryBgColor } = resolveCategoryBranding(event.category, settings);

  return {
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      description: event.description,
      category: event.category,
      categoryLogoUrl,
      categoryBgColor,
      registrationOpen: event.registrationOpen === 'true',
      showOnPortal: event.showOnPortal !== 'false',
      ...registrationFeatures,
    },
    registrantTypes: catalog.registrantTypes,
    registrantTypeLabel: registrantTypeLabel(catalog.registrantTypes),
    maxAttendeesPerRegistration: catalog.maxAttendeesPerRegistration ?? null,
    allowGuests: catalog.allowGuests,
    discountRules: {
      siblingDiscount: catalog.siblingDiscount,
      multiEventDiscount: catalog.multiEventDiscount,
      earlyBirdDiscount: catalog.earlyBirdDiscount,
    },
    additionalInfoHeading: catalog.additionalInfoHeading || 'Additional Information',
    additionalInfoSubheading: catalog.additionalInfoSubheading || '',
    formConfig,
    items,
  };
}

/**
 * Event-home stats for an items-model event, shaped to match legacy's
 * getPublicDetail() so both models can render through the same
 * EventHomeClient template. Items-model events don't have event-level
 * capacity (only per-item, shown on the register page) or activity slots,
 * so those fields are zeroed out rather than computed.
 */
export async function getItemsEventHomeDetail(eventId: string) {
  const event = await requireItemsEvent(eventId);
  const registrationFeatures = resolveRegistrationFeatures(event);

  const [registrations, allEvents, settings] = await Promise.all([
    getItemsRegistrationsForEvent(eventId),
    eventRepository.findAll(),
    settingRepository.getAll(),
  ]);

  const { categoryLogoUrl, categoryBgColor } = resolveCategoryBranding(event.category, settings);
  const upcomingEvents = buildUpcomingEventsList(allEvents, eventId, settings);

  const active = registrations.filter((r) => r.registrationStatus !== 'cancelled');
  const confirmed = active.filter((r) => r.registrationStatus !== 'waitlist');
  const waitlist = active.filter((r) => r.registrationStatus === 'waitlist');

  const memberRegAttendees = confirmed.filter((r) => r.memberId).length;
  const guestRegAttendees = confirmed.length - memberRegAttendees;

  const checkedInRegs = confirmed.filter((r) => r.participants.some((p) => p.checkedInAt));
  const memberCheckinAttendees = checkedInRegs.filter((r) => r.memberId).length;
  const guestCheckinAttendees = checkedInRegs.length - memberCheckinAttendees;

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    description: event.description,
    status: event.status,
    category: event.category || '',
    categoryLogoUrl,
    categoryBgColor,
    pricingRules: '',
    formConfig: '',
    activities: '',
    activityPricingMode: '',
    guestPolicy: '',
    registrationOpen: event.registrationOpen === 'true' ? 'true' : '',
    capacity: 0,
    capacityMode: 'per_registration',
    spotsRemaining: -1,
    waitlistCount: waitlist.length,
    totalRegistrations: confirmed.length,
    totalCheckins: memberCheckinAttendees + guestCheckinAttendees,
    totalWalkins: 0,
    memberCheckinAttendees,
    guestCheckinAttendees,
    memberRegAttendees,
    guestRegAttendees,
    totalUniqueAttendees: confirmed.length,
    totalUniqueGuests: guestRegAttendees,
    upcomingEvents,
    activityMaxSlots: undefined,
    totalActivitySlots: 0,
    selfServiceEditEnabled: registrationFeatures.selfServiceEditEnabled,
    cancelRefundEnabled: registrationFeatures.cancelRefundEnabled,
  };
}

// ========================================
// Identity — OTP-verified member/guest lookup (registration + check-in)
// ========================================

export interface ItemsRegistrantExistingRegistration {
  [field: string]: unknown;
  participants: Record<string, string>[];
  itemSelections: Record<string, string>[];
}

export interface ItemsRegistrantLookup {
  isMember: boolean;
  memberId?: string;
  memberName?: string;
  allowGuests: boolean;
  existingRegistration: ItemsRegistrantExistingRegistration | null;
  /** Spouse + children on file, for the "Use Family from Profile" button — only populated when isMember. */
  familyMembers: { name: string; age: string }[];
}

export async function lookupItemsRegistrant(eventId: string, email: string): Promise<ItemsRegistrantLookup> {
  const event = await requireItemsEvent(eventId);
  const catalog = parseItemCatalog(event.items);
  const emailLower = email.toLowerCase().trim();

  let member = await prisma.member.findFirst({
    where: {
      OR: [
        { email: { equals: emailLower, mode: 'insensitive' } },
        { loginEmail: { equals: emailLower, mode: 'insensitive' } },
      ],
    },
  });
  // A spouse's own email isn't stored on the Member row — it lives on
  // MemberSpouse (see auth.ts's getMemberEmailMap, which resolves portal
  // login the same way) — so a spouse who signs in under their own email
  // would otherwise be treated as a guest here despite being real family.
  let matchedPersonName: string | undefined;
  if (!member) {
    const spouse = await prisma.memberSpouse.findFirst({
      where: { email: { equals: emailLower, mode: 'insensitive' } },
      include: { member: true },
    });
    if (spouse) {
      member = spouse.member;
      matchedPersonName = `${spouse.firstName || ''} ${spouse.lastName || ''}`.trim() || undefined;
    }
  }

  const existing = await prisma.eventItemRegistration.findFirst({
    where: { eventId, contactEmail: emailLower, registrationStatus: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
  });

  let existingRegistration: ItemsRegistrantLookup['existingRegistration'] = null;
  if (existing) {
    const [record, participants, itemSelections] = await Promise.all([
      eventItemRegistrationRepository.findById(existing.id),
      eventRegistrationParticipantRepository.findByRegistrationId(existing.id),
      eventRegistrationItemSelectionRepository.findByRegistrationId(existing.id),
    ]);
    existingRegistration = { ...(record as Record<string, unknown>), participants, itemSelections };
  }

  const familyMembers: { name: string; age: string }[] = [];
  if (member) {
    const [spouses, children] = await Promise.all([
      memberSpouseRepository.findByMemberId(member.id),
      memberChildRepository.findByMemberId(member.id),
    ]);
    for (const sp of spouses) {
      // Skip the spouse if they're the one signing in — don't offer someone
      // their own name as a "family member" to pull in.
      if ((sp.email || '').toLowerCase().trim() === emailLower) continue;
      const name = `${sp.firstName || ''} ${sp.lastName || ''}`.trim();
      if (name) familyMembers.push({ name, age: '' });
    }
    for (const child of children) {
      if (child.name) familyMembers.push({ name: child.name, age: child.age || '' });
    }
  }

  return {
    isMember: !!member,
    memberId: member?.id,
    memberName: matchedPersonName || (member ? `${member.firstName || ''} ${member.lastName || ''}`.trim() : undefined),
    allowGuests: catalog.allowGuests,
    existingRegistration,
    familyMembers,
  };
}

/**
 * Whether an email belongs to a member or a member's spouse — used by the
 * registration flow's OTP-send step to route them to real sign-in instead of
 * the lightweight per-event OTP (see items-otp route). Not used by check-in,
 * where members/guests alike may always use OTP even if not signed in.
 */
export async function checkMemberOrSpouseIdentity(email: string): Promise<{ isMemberOrSpouse: boolean; firstName?: string }> {
  const emailLower = email.toLowerCase().trim();
  const member = await prisma.member.findFirst({
    where: {
      OR: [
        { email: { equals: emailLower, mode: 'insensitive' } },
        { loginEmail: { equals: emailLower, mode: 'insensitive' } },
      ],
    },
  });
  if (member) return { isMemberOrSpouse: true, firstName: member.firstName || undefined };

  const spouse = await prisma.memberSpouse.findFirst({
    where: { email: { equals: emailLower, mode: 'insensitive' } },
  });
  if (spouse) return { isMemberOrSpouse: true, firstName: spouse.firstName || undefined };

  return { isMemberOrSpouse: false };
}

// ========================================
// Checkout
// ========================================

interface ItemSelectionInput {
  itemId: string;
  quantity: number;
  customFieldResponses?: Record<string, unknown>;
}

interface CreateItemsRegistrationInput {
  memberId?: string;
  guestId?: string;
  registrantType?: string;
  attendeeCount: number;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  customFieldResponses?: Record<string, unknown>;
  participants: { name: string; age?: string }[];
  itemSelections: ItemSelectionInput[];
  paymentStatus?: string;
  paymentMethod?: string;
  transactionId?: string;
}

function computeSelectionPrice(item: ItemConfig, quantity: number, isMember: boolean): number {
  const unitPrice = isMember ? item.memberPrice : item.guestPrice;
  return item.pricingMode === 'flat' ? unitPrice : unitPrice * quantity;
}

export async function createItemsRegistration(eventId: string, input: CreateItemsRegistrationInput) {
  const event = await requireItemsEvent(eventId);
  const catalog = parseItemCatalog(event.items);
  const itemsById = new Map(catalog.items.map((it) => [it.id, it]));

  // isMember is only ever true when the caller explicitly passed a memberId
  // (e.g. a future member-lookup step, or an admin registering a known
  // member) — never auto-detected by email match. The client computes and
  // charges the exact price shown to the registrant before payment; if the
  // server silently applied a different (member) price here based on an
  // email match the client couldn't have known about, the amount actually
  // charged via Square/PayPal would no longer match this registration's
  // recorded totalPrice, and refunds computed off that total would be wrong.
  // The route already confirmed the caller verified contactEmail via OTP
  // (hasValidGuestSession) — but that only proves control of contactEmail,
  // not that a claimed memberId actually belongs to it. Re-check that here
  // so a verified guest can't just pass an arbitrary memberId to buy their
  // way into member pricing.
  const candidateMember = input.memberId ? await prisma.member.findUnique({ where: { id: input.memberId } }) : null;
  const contactEmailLower = input.contactEmail.toLowerCase().trim();
  const member = candidateMember && (
    candidateMember.email?.toLowerCase() === contactEmailLower ||
    candidateMember.loginEmail?.toLowerCase() === contactEmailLower
  ) ? candidateMember : null;
  const isMember = !!member;

  if (!catalog.allowGuests && !isMember) throw new GuestsNotAllowedError();

  // Merge in any required items the client didn't already include — required
  // items are auto-included and can't be left out, regardless of what the
  // client submitted.
  const selectionMap = new Map(input.itemSelections.map((s) => [s.itemId, s]));
  for (const item of catalog.items) {
    if (item.required && item.enabled && !selectionMap.has(item.id)) {
      selectionMap.set(item.id, { itemId: item.id, quantity: 1 });
    }
  }

  const resolvedSelections: { item: ItemConfig; quantity: number; price: number; customFieldResponses?: Record<string, unknown> }[] = [];
  for (const sel of Array.from(selectionMap.values())) {
    const item = itemsById.get(sel.itemId);
    if (!item || !item.enabled) continue;
    const quantity = item.pricingMode === 'flat' ? 1 : Math.max(1, sel.quantity || 1);
    const price = computeSelectionPrice(item, quantity, isMember);
    resolvedSelections.push({ item, quantity, price, customFieldResponses: sel.customFieldResponses });
  }

  const pricingInputs: ItemPriceInput[] = resolvedSelections.map((s) => ({
    itemName: s.item.name,
    pricingMode: s.item.pricingMode,
    unitPrice: isMember ? s.item.memberPrice : s.item.guestPrice,
    quantity: s.quantity,
    amount: s.price,
    isGeneralAttendance: s.item.isGeneralAttendance,
  }));
  const priceBreakdown = calculateItemsPrice(pricingInputs, catalog);
  const totalPrice = priceBreakdown.total;

  const now = new Date().toISOString();
  const paymentStatus = totalPrice <= 0 ? 'paid' : (input.paymentStatus || '');
  const paymentMethod = totalPrice <= 0 ? 'free' : (input.paymentMethod || '');
  const transactionId = totalPrice <= 0 ? '' : (input.transactionId || '');

  // NOT wrapped in prisma.$transaction — this app's Prisma client runs on
  // Neon's stateless HTTP driver (PrismaNeonHttp, src/lib/db.ts), which does
  // not support interactive transactions at all ("Transactions are not
  // supported in HTTP mode"). That's why nothing else in this codebase uses
  // $transaction either (confirmed zero usage in events.service.ts). Capacity
  // is therefore a best-effort read-then-write check, same race window as
  // the legacy capacity checks in events.service.ts — not the airtight
  // guarantee a Serializable transaction would give, which isn't available
  // on this connection layer without switching the whole app off the HTTP
  // adapter (a bigger, separate change).
  for (const { item, quantity } of resolvedSelections) {
    if (!item.capacity) continue;
    const active = await prisma.eventRegistrationItemSelection.findMany({
      where: { itemId: item.id, status: { not: 'cancelled' } },
      select: { quantity: true },
    });
    const used = active.reduce((sum, s) => sum + s.quantity, 0);
    if (used + quantity > item.capacity) throw new ItemSoldOutError(item.name);
  }

  let registrationStatus = 'confirmed';
  if (event.capacity && parseInt(event.capacity, 10) > 0) {
    const existingCount = await prisma.eventItemRegistration.count({
      where: { eventId, registrationStatus: { not: 'cancelled' } },
    });
    if (existingCount >= parseInt(event.capacity, 10)) registrationStatus = 'waitlist';
  }

  const registration = await prisma.eventItemRegistration.create({
    data: {
      eventId,
      memberId: member?.id || null,
      guestId: input.guestId || null,
      registrantType: input.registrantType || registrantTypeLabel(catalog.registrantTypes),
      attendeeCount: input.attendeeCount,
      contactName: input.contactName,
      contactEmail: input.contactEmail.toLowerCase().trim(),
      contactPhone: input.contactPhone || '',
      customFieldResponses: (input.customFieldResponses ?? {}) as Prisma.InputJsonValue,
      totalPrice: String(totalPrice),
      priceBreakdown: priceBreakdown as unknown as Prisma.InputJsonValue,
      paymentStatus,
      paymentMethod,
      transactionId,
      registrationStatus,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Individual creates, not createMany — createMany also runs as an internal
  // transaction under this Prisma version, unsupported by the Neon HTTP
  // adapter (see the note above createItemsRegistration's capacity checks).
  for (const p of input.participants) {
    await prisma.eventRegistrationParticipant.create({
      data: { registrationId: registration.id, name: p.name, age: p.age || '' },
    });
  }

  for (const sel of resolvedSelections) {
    await prisma.eventRegistrationItemSelection.create({
      data: {
        registrationId: registration.id,
        itemId: sel.item.id,
        itemName: sel.item.name,
        quantity: sel.quantity,
        priceCharged: String(sel.price),
        customFieldResponses: (sel.customFieldResponses ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  await registrationLedgerRepository.create({
    eventId,
    participantId: registration.id,
    email: registration.contactEmail,
    type: 'registered',
    snapshot: { attendeeCount: input.attendeeCount, totalPrice: String(totalPrice), items: resolvedSelections.map((s) => ({ itemId: s.item.id, itemName: s.item.name, quantity: s.quantity, price: s.price })) },
  });
  if (paymentStatus === 'paid' && totalPrice > 0) {
    await registrationLedgerRepository.create({
      eventId,
      participantId: registration.id,
      email: registration.contactEmail,
      type: 'charge',
      amount: String(totalPrice),
      method: paymentMethod,
      transactionId,
    });
  }

  logActivity({
    userEmail: registration.contactEmail,
    action: 'create',
    entityType: 'ItemsRegistration',
    entityId: registration.id,
    entityLabel: registration.contactName,
    description: `Registered for event (${resolvedSelections.length} item${resolvedSelections.length === 1 ? '' : 's'})`,
  });

  return eventItemRegistrationRepository.findById(registration.id);
}

interface UpdateItemsRegistrationInput {
  contactName: string;
  contactPhone?: string;
  attendeeCount: number;
  customFieldResponses?: Record<string, unknown>;
  participants: { name: string; age?: string }[];
  itemSelections: ItemSelectionInput[];
  paymentStatus?: string;
  paymentMethod?: string;
  transactionId?: string;
}

/**
 * Self-service (or admin) edit of an existing items registration — replaces
 * its item selections and attendee list wholesale, then charges or refunds
 * only the price difference (mirrors legacy's updateRegistration in
 * events.service.ts). Not wrapped in a DB transaction — see the capacity-
 * check comment in createItemsRegistration for why (Neon HTTP adapter).
 */
export async function updateItemsRegistration(
  registrationId: string,
  input: UpdateItemsRegistrationInput,
  opts: { isAdminOrCommittee?: boolean } = {},
) {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');
  if (registration.registrationStatus === 'cancelled') throw new RegistrationCancelledError();

  const event = await eventRepository.findById(registration.eventId);
  if (!event) throw new NotFoundError('Event');

  const registrationFeatures = resolveRegistrationFeatures(event);
  if (!opts.isAdminOrCommittee && !registrationFeatures.selfServiceEditEnabled) {
    throw new SelfServiceEditDisabledError();
  }

  const catalog = parseItemCatalog(event.items);
  const itemsById = new Map(catalog.items.map((it) => [it.id, it]));
  // The registration's memberId was already verified (against contactEmail)
  // at creation time — editing doesn't re-derive membership, it's fixed for
  // the life of the registration.
  const isMember = !!registration.memberId;

  if (!catalog.allowGuests && !isMember) throw new GuestsNotAllowedError();

  const selectionMap = new Map(input.itemSelections.map((s) => [s.itemId, s]));
  for (const item of catalog.items) {
    if (item.required && item.enabled && !selectionMap.has(item.id)) {
      selectionMap.set(item.id, { itemId: item.id, quantity: 1 });
    }
  }

  const resolvedSelections: { item: ItemConfig; quantity: number; price: number; customFieldResponses?: Record<string, unknown> }[] = [];
  for (const sel of Array.from(selectionMap.values())) {
    const item = itemsById.get(sel.itemId);
    if (!item || !item.enabled) continue;
    const quantity = item.pricingMode === 'flat' ? 1 : Math.max(1, sel.quantity || 1);
    const price = computeSelectionPrice(item, quantity, isMember);
    resolvedSelections.push({ item, quantity, price, customFieldResponses: sel.customFieldResponses });
  }

  // Capacity check for increased quantities — exclude this registration's
  // own existing selections so re-saving the same items doesn't self-block.
  for (const { item, quantity } of resolvedSelections) {
    if (!item.capacity) continue;
    const active = await prisma.eventRegistrationItemSelection.findMany({
      where: { itemId: item.id, status: { not: 'cancelled' }, registrationId: { not: registrationId } },
      select: { quantity: true },
    });
    const used = active.reduce((sum, s) => sum + s.quantity, 0);
    if (used + quantity > item.capacity) throw new ItemSoldOutError(item.name);
  }

  const pricingInputs: ItemPriceInput[] = resolvedSelections.map((s) => ({
    itemName: s.item.name,
    pricingMode: s.item.pricingMode,
    unitPrice: isMember ? s.item.memberPrice : s.item.guestPrice,
    quantity: s.quantity,
    amount: s.price,
    isGeneralAttendance: s.item.isGeneralAttendance,
  }));
  const priceBreakdown = calculateItemsPrice(pricingInputs, catalog);
  const newTotal = priceBreakdown.total;
  const oldPaidAmount = registration.paymentStatus === 'paid' ? parseAmount(registration.totalPrice) : 0;
  const now = new Date().toISOString();

  // Replace item selections: cancel the old active ones, create fresh rows
  // for the new set. The aggregate price delta (charged/refunded below)
  // covers what per-item cancellation would otherwise book individually, so
  // these cancelled rows carry no refundedAmount of their own.
  const oldActiveSelections = (await eventRegistrationItemSelectionRepository.findByRegistrationId(registrationId))
    .filter((s) => s.status !== 'cancelled');
  for (const sel of oldActiveSelections) {
    await eventRegistrationItemSelectionRepository.update(sel.id, { status: 'cancelled', cancelledAt: now });
  }
  for (const sel of resolvedSelections) {
    await eventRegistrationItemSelectionRepository.create({
      registrationId,
      itemId: sel.item.id,
      itemName: sel.item.name,
      quantity: sel.quantity,
      priceCharged: String(sel.price),
      customFieldResponses: (sel.customFieldResponses ?? {}) as Prisma.InputJsonValue,
    });
  }

  // Replace participants wholesale — editing doesn't try to preserve
  // check-in state across a full attendee-list swap.
  await prisma.eventRegistrationParticipant.deleteMany({ where: { registrationId } });
  for (const p of input.participants) {
    await prisma.eventRegistrationParticipant.create({ data: { registrationId, name: p.name, age: p.age || '' } });
  }

  const updateData: Record<string, unknown> = {
    contactName: input.contactName,
    contactPhone: input.contactPhone || '',
    attendeeCount: input.attendeeCount,
    customFieldResponses: (input.customFieldResponses ?? {}) as Prisma.InputJsonValue,
    totalPrice: String(newTotal),
    priceBreakdown: priceBreakdown as unknown as Prisma.InputJsonValue,
    updatedAt: now,
  };

  let refundOutcome: RefundOutcome | undefined;
  if (input.paymentStatus && newTotal > oldPaidAmount) {
    // Client already collected payment for the (newTotal - oldPaidAmount)
    // difference via PaymentForm before calling this — record it as its own
    // charge entry, not a rewrite of the original transactionId, so a later
    // refund can still find and refund the original capture too.
    updateData.paymentStatus = input.paymentStatus;
    updateData.paymentMethod = input.paymentMethod || '';
    updateData.transactionId = input.transactionId || '';
    await registrationLedgerRepository.create({
      eventId: registration.eventId,
      participantId: registrationId,
      email: registration.contactEmail,
      type: 'charge',
      amount: String(newTotal - oldPaidAmount),
      method: input.paymentMethod || '',
      transactionId: input.transactionId || '',
      note: 'Additional payment from registration edit',
    });
  } else if (registration.paymentStatus === 'paid' && newTotal < oldPaidAmount) {
    refundOutcome = await refundRegistrationPayment({
      participantId: registrationId,
      eventId: registration.eventId,
      eventName: event.name,
      participantName: input.contactName || registration.contactName,
      participantEmail: registration.contactEmail,
      amount: String(oldPaidAmount - newTotal),
      reason: `Registration updated: ${event.name}`,
      autoRefundEnabled: registrationFeatures.cancelRefundEnabled,
      fallbackMethod: registration.paymentMethod,
      fallbackTransactionId: registration.transactionId,
      fallbackAmount: registration.totalPrice,
    });
  }

  await registrationLedgerRepository.create({
    eventId: registration.eventId,
    participantId: registrationId,
    email: registration.contactEmail,
    type: 'edited',
    snapshot: {
      totalPrice: String(newTotal),
      items: resolvedSelections.map((s) => ({ itemId: s.item.id, itemName: s.item.name, quantity: s.quantity, price: s.price })),
    },
  });

  const updated = await eventItemRegistrationRepository.update(registrationId, updateData);

  logActivity({
    userEmail: registration.contactEmail,
    action: 'update',
    entityType: 'ItemsRegistration',
    entityId: registrationId,
    entityLabel: input.contactName || registration.contactName,
    description: 'Registration edited',
  });

  return { registration: updated, refundOutcome };
}

export async function getItemsRegistrationsForEvent(eventId: string) {
  await requireItemsEvent(eventId);
  const registrations = await eventItemRegistrationRepository.findByEventId(eventId);
  return Promise.all(registrations.map(async (r) => {
    const participants = await eventRegistrationParticipantRepository.findByRegistrationId(r.id);
    const itemSelections = await eventRegistrationItemSelectionRepository.findByRegistrationId(r.id);
    // Object.assign (rather than object-spread) preserves r's index signature
    // in the inferred type, so callers can read arbitrary registration
    // columns (registrationStatus, memberId, ...) alongside the joined rows.
    return Object.assign({}, r, { participants, itemSelections });
  }));
}

// ========================================
// Check-in
// ========================================

export async function checkinItemsParticipant(registrationId: string, participantId: string) {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');
  const participant = await eventRegistrationParticipantRepository.findById(participantId);
  if (!participant || participant.registrationId !== registrationId) throw new NotFoundError('Participant');

  if (participant.checkedInAt) return participant; // idempotent

  const checkedInAt = new Date().toISOString();
  const updated = await eventRegistrationParticipantRepository.update(participantId, { checkedInAt });

  await recordAttendance(registration.eventId, registration.contactEmail, registration.memberId || null, checkedInAt);

  logActivity({
    userEmail: registration.contactEmail,
    action: 'update',
    entityType: 'Check-in',
    entityId: participantId,
    entityLabel: participant.name || registration.contactName,
    description: 'Checked in for event',
  });

  return updated;
}

// ========================================
// Cancellation & refunds
// ========================================

export async function cancelItemSelection(registrationId: string, itemSelectionId: string, opts: { reason?: string }): Promise<{ selection: Record<string, string>; outcome: RefundOutcome }> {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');
  const selection = await eventRegistrationItemSelectionRepository.findById(itemSelectionId);
  if (!selection || selection.registrationId !== registrationId) throw new NotFoundError('Item selection');
  if (selection.status === 'cancelled') return { selection, outcome: { status: 'none' } };

  const event = await eventRepository.findById(registration.eventId);
  const amount = parseAmount(selection.priceCharged);
  const registrationFeatures = resolveRegistrationFeatures(event || {});
  const reason = opts.reason || `Item cancelled: ${selection.itemName}`;

  const outcome = await refundRegistrationPayment({
    participantId: registrationId,
    eventId: registration.eventId,
    eventName: event?.name || '',
    participantName: registration.contactName,
    participantEmail: registration.contactEmail,
    amount: String(amount),
    reason,
    autoRefundEnabled: registrationFeatures.cancelRefundEnabled,
    fallbackMethod: registration.paymentMethod,
    fallbackTransactionId: registration.transactionId,
    fallbackAmount: registration.totalPrice,
  });

  const refundedAmount = outcome.status === 'refunded' ? outcome.refundedAmount : outcome.status === 'partial' ? outcome.refundedAmount : 0;

  const updated = await eventRegistrationItemSelectionRepository.update(itemSelectionId, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    refundedAmount: String(refundedAmount),
  });

  const newTotal = Math.max(0, parseAmount(registration.totalPrice) - amount);
  await eventItemRegistrationRepository.update(registrationId, { totalPrice: String(newTotal) });

  logActivity({
    userEmail: registration.contactEmail,
    action: 'update',
    entityType: 'ItemsRegistration',
    entityId: registrationId,
    entityLabel: registration.contactName,
    description: `Cancelled item "${selection.itemName}" ($${amount.toFixed(2)})`,
  });

  return { selection: updated, outcome };
}

export async function cancelItemsRegistrationWithRefund(registrationId: string, opts: { reason?: string }) {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');

  const activeSelections = (await eventRegistrationItemSelectionRepository.findByRegistrationId(registrationId))
    .filter((s) => s.status !== 'cancelled');

  const outcomes: RefundOutcome[] = [];
  for (const sel of activeSelections) {
    const { outcome } = await cancelItemSelection(registrationId, sel.id, { reason: opts.reason || 'Registration cancelled' });
    outcomes.push(outcome);
  }

  const updated = await eventItemRegistrationRepository.update(registrationId, {
    registrationStatus: 'cancelled',
    totalPrice: '0',
  });

  logActivity({
    userEmail: registration.contactEmail,
    action: 'update',
    entityType: 'ItemsRegistration',
    entityId: registrationId,
    entityLabel: registration.contactName,
    description: 'Cancelled entire registration',
  });

  return { registration: updated, outcomes };
}

export const eventItemsService = {
  getItemsEventPublicDetail,
  createItemsRegistration,
  updateItemsRegistration,
  getItemsRegistrationsForEvent,
  checkinItemsParticipant,
  cancelItemSelection,
  cancelItemsRegistrationWithRefund,
};
