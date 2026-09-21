import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import * as Sentry from '@sentry/nextjs';
import { parseAmount } from '@/lib/utils';
import { logActivity } from '@/lib/audit-log';
import { parseItemCatalog, parseFormConfig, resolveRegistrationFeatures, registrantTypeLabel, getItemsTerminology, isAllowedGuestEmail } from '@/lib/event-config';
import { calculateItemsPrice, type ItemPriceInput } from '@/lib/pricing';
import { buildItemsRegistrationEmail, buildItemsRegistrationAdminAlertEmail, type ItemsEmailLineItem } from '@/lib/items-registration-emails';
import { describeRefundOutcome, combineRefundOutcomes } from '@/lib/refund-outcome';
import { getAppUrl } from '@/lib/app-url';
import type { ItemConfig, EntryTypeConfig, RefundOutcome } from '@/types';
import { eventRepository, eventItemRegistrationRepository, eventRegistrationParticipantRepository, eventRegistrationItemSelectionRepository, registrationLedgerRepository, settingRepository, memberSpouseRepository, memberChildRepository } from '@/repositories';
import { NotFoundError } from './crud.service';
import { recordAttendance } from './engagement.service';
import { refundRegistrationPayment } from './refunds.service';
import { resolveCategoryBranding, buildUpcomingEventsList, getCategoryEmail } from './events.service';
import { sendEmail } from './email.service';
import { getPublicSponsors } from './sponsors.service';

export class ItemSoldOutError extends Error {
  constructor(itemName: string) {
    super(`"${itemName}" just sold out — please remove it or pick something else.`);
    this.name = 'ItemSoldOutError';
  }
}

// Distinct from ItemSoldOutError — this fires when the EVENT's combined
// cap across every Activity item's entries is exhausted, not any single
// item/entry type's own capacity, so it needs its own, less item-specific
// message.
export class EventSlotsFullError extends Error {
  constructor() {
    super('This event has reached its maximum number of activity slots — please remove an entry or pick something else.');
    this.name = 'EventSlotsFullError';
  }
}

export class GuestsNotAllowedError extends Error {
  constructor() {
    super('This event is open to verified members only.');
    this.name = 'GuestsNotAllowedError';
  }
}

export class GuestEmailDomainNotAllowedError extends Error {
  constructor(allowedDomains: string[]) {
    super(`This event only accepts guest registrations from ${allowedDomains.join(', ')} email addresses.`);
    this.name = 'GuestEmailDomainNotAllowedError';
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
  if (!event || event.registrationModel !== 'items' || event.deletedAt) throw new NotFoundError('Event');
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
      let entryTypes: (EntryTypeConfig & { remainingCapacity: number | null })[] | undefined;
      if (item.isActivity && item.entryTypes) {
        entryTypes = await Promise.all(item.entryTypes.map(async (et) => {
          if (!et.capacity) return { ...et, remainingCapacity: null };
          // Capacity is per-entry (a slot/room/group), not per-participant —
          // a 2-person Group entry still only uses one of that entry type's slots.
          const used = await eventRegistrationItemSelectionRepository.countActiveByItemAndEntryType(item.id, et.key);
          return { ...et, remainingCapacity: Math.max(0, et.capacity - used) };
        }));
      }
      return { ...item, remainingCapacity, entryTypes };
    }),
  );

  // Same category → logo/bgColor resolution legacy's getPublicDetail uses,
  // so the shared PublicLayout header renders identically for both models.
  const [settings, allEvents] = await Promise.all([settingRepository.getAll(), eventRepository.findAll()]);
  const { categoryLogoUrl, categoryBgColor } = resolveCategoryBranding(event.category, settings);
  const upcomingEvents = buildUpcomingEventsList(allEvents, eventId, settings);

  // Event-wide cap across every Activity item's entries combined — separate
  // from (and enforced alongside) each entry type's own capacity.
  let remainingTotalActivitySlots: number | null = null;
  if (catalog.maxTotalActivitySlots) {
    const usedTotalSlots = await eventRegistrationItemSelectionRepository.countActiveActivitySlotsForEvent(eventId);
    remainingTotalActivitySlots = Math.max(0, catalog.maxTotalActivitySlots - usedTotalSlots);
  }

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
    terminology: getItemsTerminology(catalog),
    formConfig,
    items,
    upcomingEvents,
    remainingTotalActivitySlots,
    maxTotalActivitySlots: catalog.maxTotalActivitySlots ?? null,
  };
}

/**
 * Event-home stats for an items-model event, shaped to match legacy's
 * getPublicDetail() so both models can render through the same
 * EventHomeClient template. Items-model events don't have per-activity
 * slots, so that field is zeroed out — but the overall registration cap
 * (Event.capacity, set on the items-config page) is real and already
 * enforced at registration time (see the waitlist check in
 * createItemsRegistration), so it's computed here the same way, not
 * hardcoded, so the home page actually shows it.
 */
export async function getItemsEventHomeDetail(eventId: string) {
  const event = await requireItemsEvent(eventId);
  const registrationFeatures = resolveRegistrationFeatures(event);
  const catalog = parseItemCatalog(event.items);
  const terminology = getItemsTerminology(catalog);

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

  // Same counting rule as createItemsRegistration's waitlist check: family
  // events count registration rows, individual (adult/kids) events count
  // headcount — otherwise a 6-person "individual" registration would only
  // ever occupy a single slot against the cap.
  const capacity = event.capacity ? parseInt(event.capacity, 10) : 0;
  const isFamilyEvent = catalog.registrantTypes.includes('family');
  const capacityUsed = isFamilyEvent
    ? active.length
    : active.reduce((sum, r) => sum + (parseInt(r.attendeeCount || '1', 10) || 0), 0);
  const spotsRemaining = capacity > 0 ? Math.max(0, capacity - capacityUsed) : -1;

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
    capacity,
    capacityMode: 'per_registration',
    spotsRemaining,
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
    terminology,
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

// A named performer/attendee on one Activity entry — `fields` holds answers
// to that entry type's configured participantFields, keyed by field id.
interface EntryParticipantInput {
  name: string;
  fields?: Record<string, string>;
}

interface ItemSelectionInput {
  itemId: string;
  quantity: number;
  customFieldResponses?: Record<string, unknown>;
  // Only meaningful for isActivity items — which EntryTypeConfig this row
  // represents, and the named participants on this specific entry.
  entryTypeKey?: string;
  participants?: EntryParticipantInput[];
}

interface ResolvedSelection {
  item: ItemConfig;
  quantity: number;
  price: number;
  displayName: string;
  customFieldResponses?: Record<string, unknown>;
  entryTypeKey?: string;
  participants?: EntryParticipantInput[];
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
  emailConsent?: string;
  mediaConsent?: string;
}

function resolveEntryType(item: ItemConfig, entryTypeKey?: string): EntryTypeConfig | undefined {
  return item.entryTypes?.find((et) => et.key === entryTypeKey);
}

/**
 * Notify the event category's contact (same recipient resolution the legacy
 * model's "new registration" alert already uses) that a registration was
 * created/updated/cancelled — separate from the registrant's own
 * confirmation email above and from notifyTreasurer (refunds.service.ts),
 * which only fires on refund trouble. Never throws — a notification failure
 * must not block the action that triggered it.
 */
async function sendAdminAlert(opts: {
  action: 'created' | 'updated' | 'cancelled' | 'item_cancelled';
  eventCategory: string;
  eventName: string;
  eventDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  registrationStatus: string;
  attendeeCount: number;
  items: ItemsEmailLineItem[];
  totalPrice: number;
  paymentStatus: string;
  paymentMethod?: string;
  refundMessage?: { message: string; tone: 'success' | 'warning' | 'error' };
  registrationId: string;
}): Promise<void> {
  try {
    const catEmail = await getCategoryEmail(opts.eventCategory);
    if (!catEmail) return;
    const subjectVerb = { created: 'New Registration', updated: 'Registration Updated', cancelled: 'Registration Cancelled', item_cancelled: 'Item Cancelled' }[opts.action];
    const emailHtml = buildItemsRegistrationAdminAlertEmail(opts);
    await sendEmail([catEmail], `${subjectVerb}: ${opts.contactName} for ${opts.eventName}`, emailHtml, 'system');
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Items registration admin alert email failed', registrationId: opts.registrationId, action: opts.action, eventCategory: opts.eventCategory } });
  }
}

function computeSelectionPrice(item: ItemConfig, quantity: number, isMember: boolean, entryType?: EntryTypeConfig): number {
  if (item.isActivity) {
    if (!entryType) return 0;
    const unitPrice = isMember ? entryType.memberPrice : entryType.guestPrice;
    return entryType.pricingMode === 'flat' ? unitPrice : unitPrice * quantity;
  }
  const unitPrice = isMember ? item.memberPrice : item.guestPrice;
  return item.pricingMode === 'flat' ? unitPrice : unitPrice * quantity;
}

/**
 * Resolve a client's raw itemSelections into priced, item-attached rows.
 * Non-activity items are deduped to one selection per itemId (defensive —
 * mirrors the old Map-based behavior). Activity items are NOT deduped: the
 * whole point of isActivity is that the same item can appear multiple times
 * in one cart, once per entry, each with its own entryTypeKey/participants.
 * Unknown/disabled items and activity selections with an unresolvable entry
 * type are silently dropped, same defensive posture as an unknown itemId.
 */
function resolveSelections(
  selections: ItemSelectionInput[],
  itemsById: Map<string, ItemConfig>,
  isMember: boolean,
): ResolvedSelection[] {
  const resolved: ResolvedSelection[] = [];
  const seenStandardItemIds = new Set<string>();
  for (const sel of selections) {
    const item = itemsById.get(sel.itemId);
    if (!item || !item.enabled) continue;
    // Re-validate member/guest visibility server-side — the register UI
    // already hides an item from the identity it's not configured for, but
    // a selection for it must still be silently dropped here (same as a
    // disabled item above) in case a client sends it directly.
    if (isMember ? item.visibleToMembers === false : item.visibleToGuests === false) continue;

    if (item.isActivity) {
      const entryType = resolveEntryType(item, sel.entryTypeKey);
      if (!entryType) continue;
      const participants = (sel.participants || []).filter((p) => p.name?.trim());
      const quantity = Math.max(1, participants.length || 1);
      const price = computeSelectionPrice(item, quantity, isMember, entryType);
      resolved.push({
        item,
        quantity,
        price,
        displayName: `${item.name} (${entryType.label})`,
        customFieldResponses: sel.customFieldResponses,
        entryTypeKey: entryType.key,
        participants,
      });
      continue;
    }

    if (seenStandardItemIds.has(item.id)) continue;
    seenStandardItemIds.add(item.id);
    const quantity = item.pricingMode === 'flat' ? 1 : Math.max(1, sel.quantity || 1);
    const price = computeSelectionPrice(item, quantity, isMember);
    resolved.push({ item, quantity, price, displayName: item.name, customFieldResponses: sel.customFieldResponses });
  }
  return resolved;
}

/**
 * Capacity checks for a resolved selection set: an overall per-item ceiling
 * (item.capacity, summed across all its entry types/quantities) plus a
 * per-entry-type ceiling (entryType.capacity, counting entries/rows, not
 * participant headcount — a 2-person Group entry still uses one slot).
 * `excludeRegistrationId` lets an edit re-save its own existing rows without
 * self-blocking. Not wrapped in a transaction — see the note in
 * createItemsRegistration for why (Neon HTTP adapter).
 */
async function checkCapacity(
  eventId: string,
  maxTotalActivitySlots: number | undefined,
  resolvedSelections: ResolvedSelection[],
  excludeRegistrationId?: string,
): Promise<void> {
  const itemQuantityTotals = new Map<string, number>();
  for (const sel of resolvedSelections) {
    itemQuantityTotals.set(sel.item.id, (itemQuantityTotals.get(sel.item.id) || 0) + sel.quantity);
  }
  for (const [itemId, addedQuantity] of Array.from(itemQuantityTotals.entries())) {
    const item = resolvedSelections.find((s) => s.item.id === itemId)!.item;
    if (!item.capacity) continue;
    const active = await prisma.eventRegistrationItemSelection.findMany({
      where: {
        itemId,
        status: { not: 'cancelled' },
        ...(excludeRegistrationId ? { registrationId: { not: excludeRegistrationId } } : {}),
      },
      select: { quantity: true },
    });
    const used = active.reduce((sum, s) => sum + s.quantity, 0);
    if (used + addedQuantity > item.capacity) throw new ItemSoldOutError(item.name);
  }

  const entryTypeCounts = new Map<string, { item: ItemConfig; entryType: EntryTypeConfig; added: number }>();
  for (const sel of resolvedSelections) {
    if (!sel.item.isActivity || !sel.entryTypeKey) continue;
    const entryType = resolveEntryType(sel.item, sel.entryTypeKey);
    if (!entryType) continue;
    const key = `${sel.item.id}::${sel.entryTypeKey}`;
    const existing = entryTypeCounts.get(key);
    if (existing) existing.added += 1;
    else entryTypeCounts.set(key, { item: sel.item, entryType, added: 1 });
  }
  for (const { item, entryType, added } of Array.from(entryTypeCounts.values())) {
    if (!entryType.capacity) continue;
    const active = await prisma.eventRegistrationItemSelection.count({
      where: {
        itemId: item.id,
        entryTypeKey: entryType.key,
        status: { not: 'cancelled' },
        ...(excludeRegistrationId ? { registrationId: { not: excludeRegistrationId } } : {}),
      },
    });
    if (active + added > entryType.capacity) throw new ItemSoldOutError(`${item.name} (${entryType.label})`);
  }

  // Event-wide ceiling across every Activity item's entries combined —
  // checked independently of (in addition to) each entry type's own
  // capacity above. addedTotalSlots counts every Activity entry in this
  // submission regardless of which item/entry type it belongs to.
  if (maxTotalActivitySlots) {
    const addedTotalSlots = resolvedSelections.filter((s) => s.item.isActivity && s.entryTypeKey).length;
    if (addedTotalSlots > 0) {
      const activeTotalSlots = await prisma.eventRegistrationItemSelection.count({
        where: {
          entryTypeKey: { not: '' },
          status: { not: 'cancelled' },
          registration: { eventId },
          ...(excludeRegistrationId ? { registrationId: { not: excludeRegistrationId } } : {}),
        },
      });
      if (activeTotalSlots + addedTotalSlots > maxTotalActivitySlots) throw new EventSlotsFullError();
    }
  }
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
  if (!isMember && catalog.allowedGuestEmailDomains?.length && !isAllowedGuestEmail(contactEmailLower, catalog.allowedGuestEmailDomains)) {
    throw new GuestEmailDomainNotAllowedError(catalog.allowedGuestEmailDomains);
  }

  // Merge in any required items the client didn't already include — required
  // items are auto-included and can't be left out, regardless of what the
  // client submitted. (Activity items can never be `required` — the admin UI
  // enforces that, since there's no valid entry type/participants to
  // auto-include.)
  const providedItemIds = new Set(input.itemSelections.map((s) => s.itemId));
  const selections: ItemSelectionInput[] = [...input.itemSelections];
  for (const item of catalog.items) {
    if (item.required && item.enabled && !providedItemIds.has(item.id)) {
      selections.push({ itemId: item.id, quantity: 1 });
    }
  }

  const resolvedSelections = resolveSelections(selections, itemsById, isMember);

  const pricingInputs: ItemPriceInput[] = resolvedSelections.map((s) => ({
    itemId: s.item.id,
    itemName: s.displayName,
    pricingMode: s.item.isActivity ? (resolveEntryType(s.item, s.entryTypeKey)?.pricingMode ?? 'flat') : s.item.pricingMode,
    unitPrice: s.item.isActivity
      ? (isMember ? resolveEntryType(s.item, s.entryTypeKey)?.memberPrice ?? 0 : resolveEntryType(s.item, s.entryTypeKey)?.guestPrice ?? 0)
      : (isMember ? s.item.memberPrice : s.item.guestPrice),
    quantity: s.quantity,
    amount: s.price,
    isGeneralAttendance: s.item.isGeneralAttendance,
    entryTypeKey: s.item.isActivity ? s.entryTypeKey : undefined,
    participantNames: s.item.isActivity ? (s.participants || []).map((p) => p.name).filter((n) => n.trim()) : undefined,
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
  await checkCapacity(eventId, catalog.maxTotalActivitySlots, resolvedSelections);

  let registrationStatus = 'confirmed';
  if (event.capacity && parseInt(event.capacity, 10) > 0) {
    const capacityLimit = parseInt(event.capacity, 10);
    // Family-type events register one row per family — capacity counts rows.
    // Individual (adult/kids) events register a headcount per row — capacity
    // must count attendeeCount, or one 6-person "individual" registration
    // would only ever occupy a single slot against event.capacity.
    const isFamilyEvent = catalog.registrantTypes.includes('family');
    const existingUsed = isFamilyEvent
      ? await prisma.eventItemRegistration.count({ where: { eventId, registrationStatus: { not: 'cancelled' } } })
      : (await prisma.eventItemRegistration.aggregate({
          where: { eventId, registrationStatus: { not: 'cancelled' } },
          _sum: { attendeeCount: true },
        }))._sum.attendeeCount || 0;
    const addedUsed = isFamilyEvent ? 1 : input.attendeeCount;
    if (existingUsed + addedUsed > capacityLimit) registrationStatus = 'waitlist';
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
      emailConsent: input.emailConsent ?? 'true',
      mediaConsent: input.mediaConsent ?? '',
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
        entryTypeKey: sel.entryTypeKey || '',
        participantNames: (sel.participants ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  await registrationLedgerRepository.create({
    eventId,
    participantId: registration.id,
    email: registration.contactEmail,
    type: 'registered',
    snapshot: { attendeeCount: input.attendeeCount, totalPrice: String(totalPrice), items: resolvedSelections.map((s) => ({ itemId: s.item.id, itemName: s.displayName, quantity: s.quantity, price: s.price })) },
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

  const emailItems: ItemsEmailLineItem[] = resolvedSelections.map((sel) => {
    const entryType = sel.item.isActivity ? resolveEntryType(sel.item, sel.entryTypeKey) : undefined;
    const label = entryType ? `${sel.item.name} (${entryType.label})` : sel.displayName;
    const participants = sel.item.isActivity
      ? (sel.participants || []).filter((p) => p.name?.trim()).map((p) => {
          // Skip the first field — it doubles as this participant's name.
          const answers = (entryType?.participantFields || []).slice(1)
            .map((f) => (p.fields?.[f.id] ? `${f.label}: ${p.fields[f.id]}` : null))
            .filter(Boolean);
          return answers.length > 0 ? `${p.name} (${answers.join(', ')})` : p.name;
        })
      : undefined;
    return { label, amount: sel.price, participants };
  });

  // Confirmation email — never blocks the registration itself; a send
  // failure (missing SMTP config, provider outage) is logged to Sentry only,
  // same as the legacy (non-items) registration flow's equivalent block.
  try {
    const formConfig = parseFormConfig(event.formConfig);
    const regAnswers = (input.customFieldResponses ?? {}) as Record<string, string>;

    const { eventSponsors, generalSponsors } = await getPublicSponsors({ eventId, year: event.date?.slice(0, 4) });

    const emailHtml = buildItemsRegistrationEmail({
      type: 'created',
      eventName: event.name,
      eventDate: event.date,
      contactName: registration.contactName,
      registrationStatus,
      attendeeCount: input.attendeeCount,
      generalAttendanceRoster: input.participants.filter((p) => p.name?.trim()).map((p) => `${p.name}${p.age ? ` (${p.age})` : ''}`),
      items: emailItems,
      priceBreakdown,
      paymentStatus,
      paymentMethod,
      additionalInfo: formConfig.filter((f) => regAnswers[f.id]).map((f) => ({ label: f.label, value: regAnswers[f.id] })),
      eventHomeUrl: `${getAppUrl()}/events/${eventId}/home`,
      eventDescription: event.description || '',
      eventSponsors,
      generalSponsors,
    });

    const emailSubject = registrationStatus === 'waitlist' ? `Waitlisted: ${event.name}` : `Registration Confirmed: ${event.name}`;
    await sendEmail([registration.contactEmail], emailSubject, emailHtml, 'system');
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Items registration confirmation email failed', registrationId: registration.id } });
  }

  await sendAdminAlert({
    action: 'created',
    eventCategory: event.category || '',
    eventName: event.name,
    eventDate: event.date,
    contactName: registration.contactName,
    contactEmail: registration.contactEmail,
    contactPhone: registration.contactPhone,
    registrationStatus,
    attendeeCount: input.attendeeCount,
    items: emailItems,
    totalPrice,
    paymentStatus,
    paymentMethod,
    registrationId: registration.id,
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
  emailConsent?: string;
  mediaConsent?: string;
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

  const providedItemIds = new Set(input.itemSelections.map((s) => s.itemId));
  const selections: ItemSelectionInput[] = [...input.itemSelections];
  for (const item of catalog.items) {
    if (item.required && item.enabled && !providedItemIds.has(item.id)) {
      selections.push({ itemId: item.id, quantity: 1 });
    }
  }

  const resolvedSelections = resolveSelections(selections, itemsById, isMember);

  // Capacity check for increased quantities — exclude this registration's
  // own existing selections so re-saving the same items doesn't self-block.
  await checkCapacity(registration.eventId, catalog.maxTotalActivitySlots, resolvedSelections, registrationId);

  const pricingInputs: ItemPriceInput[] = resolvedSelections.map((s) => ({
    itemId: s.item.id,
    itemName: s.displayName,
    pricingMode: s.item.isActivity ? (resolveEntryType(s.item, s.entryTypeKey)?.pricingMode ?? 'flat') : s.item.pricingMode,
    unitPrice: s.item.isActivity
      ? (isMember ? resolveEntryType(s.item, s.entryTypeKey)?.memberPrice ?? 0 : resolveEntryType(s.item, s.entryTypeKey)?.guestPrice ?? 0)
      : (isMember ? s.item.memberPrice : s.item.guestPrice),
    quantity: s.quantity,
    amount: s.price,
    isGeneralAttendance: s.item.isGeneralAttendance,
    entryTypeKey: s.item.isActivity ? s.entryTypeKey : undefined,
    participantNames: s.item.isActivity ? (s.participants || []).map((p) => p.name).filter((n) => n.trim()) : undefined,
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
      entryTypeKey: sel.entryTypeKey || '',
      participantNames: sel.participants ?? undefined,
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
    emailConsent: input.emailConsent ?? 'true',
    mediaConsent: input.mediaConsent ?? '',
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
      items: resolvedSelections.map((s) => ({ itemId: s.item.id, itemName: s.displayName, quantity: s.quantity, price: s.price })),
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

  const emailItems: ItemsEmailLineItem[] = resolvedSelections.map((sel) => {
    const entryType = sel.item.isActivity ? resolveEntryType(sel.item, sel.entryTypeKey) : undefined;
    const label = entryType ? `${sel.item.name} (${entryType.label})` : sel.displayName;
    const participants = sel.item.isActivity
      ? (sel.participants || []).filter((p) => p.name?.trim()).map((p) => {
          // Skip the first field — it doubles as this participant's name.
          const answers = (entryType?.participantFields || []).slice(1)
            .map((f) => (p.fields?.[f.id] ? `${f.label}: ${p.fields[f.id]}` : null))
            .filter(Boolean);
          return answers.length > 0 ? `${p.name} (${answers.join(', ')})` : p.name;
        })
      : undefined;
    return { label, amount: sel.price, participants };
  });
  const updateRefundMessage = refundOutcome ? describeRefundOutcome(refundOutcome, 'Your registration') : undefined;

  // Confirmation email — never blocks the edit itself; see createItemsRegistration's identical rationale.
  try {
    const formConfig = parseFormConfig(event.formConfig);
    const regAnswers = (input.customFieldResponses ?? {}) as Record<string, string>;

    const { eventSponsors, generalSponsors } = await getPublicSponsors({ eventId: registration.eventId, year: event.date?.slice(0, 4) });

    const emailHtml = buildItemsRegistrationEmail({
      type: 'updated',
      eventName: event.name,
      eventDate: event.date,
      contactName: input.contactName || registration.contactName,
      registrationStatus: updated.registrationStatus,
      attendeeCount: input.attendeeCount,
      generalAttendanceRoster: input.participants.filter((p) => p.name?.trim()).map((p) => `${p.name}${p.age ? ` (${p.age})` : ''}`),
      items: emailItems,
      priceBreakdown,
      paymentStatus: updated.paymentStatus,
      paymentMethod: updated.paymentMethod,
      refundMessage: updateRefundMessage,
      additionalInfo: formConfig.filter((f) => regAnswers[f.id]).map((f) => ({ label: f.label, value: regAnswers[f.id] })),
      eventHomeUrl: `${getAppUrl()}/events/${registration.eventId}/home`,
      eventDescription: event.description || '',
      eventSponsors,
      generalSponsors,
    });
    await sendEmail([registration.contactEmail], `Registration Updated: ${event.name}`, emailHtml, 'system');
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'Items registration update email failed', registrationId } });
  }

  await sendAdminAlert({
    action: 'updated',
    eventCategory: event.category || '',
    eventName: event.name,
    eventDate: event.date,
    contactName: input.contactName || registration.contactName,
    contactEmail: registration.contactEmail,
    contactPhone: input.contactPhone || registration.contactPhone,
    registrationStatus: updated.registrationStatus,
    attendeeCount: input.attendeeCount,
    items: emailItems,
    totalPrice: newTotal,
    paymentStatus: updated.paymentStatus,
    paymentMethod: updated.paymentMethod,
    refundMessage: updateRefundMessage,
    registrationId,
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

/**
 * "Add walk-in attendee" at check-in — grows the General Attendance headcount
 * for an existing registration (e.g. an extra kid who showed up unannounced),
 * mirroring what's already possible during registration-time editing. Does
 * NOT attempt a live PayPal/Zelle charge for any resulting balance — if the
 * event's General Attendance item is priced per-participant, the marginal
 * amount is added to totalPrice and logged (type 'edited', an existing
 * ledger type) for the front desk to collect offline and reconcile manually,
 * same as any other cash/check payment this app already tracks that way.
 */
export async function addWalkInAttendee(registrationId: string, input: { name: string; age?: string }) {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');
  if (registration.registrationStatus === 'cancelled') throw new RegistrationCancelledError();

  const event = await eventRepository.findById(registration.eventId);
  if (!event) throw new NotFoundError('Event');
  const catalog = parseItemCatalog(event.items);
  const isMember = !!registration.memberId;

  const participant = await eventRegistrationParticipantRepository.create({
    registrationId,
    name: input.name || '',
    age: input.age || '',
  });

  const gaItem = catalog.items.find((it) => it.isGeneralAttendance && it.enabled);
  let addedAmount = 0;
  if (gaItem) {
    const activeGaSelections = (await eventRegistrationItemSelectionRepository.findByRegistrationId(registrationId))
      .filter((s) => s.status !== 'cancelled' && s.itemId === gaItem.id);
    const existing = activeGaSelections[0];
    if (existing) {
      const newQuantity = (parseInt(existing.quantity || '1', 10) || 1) + 1;
      const newPrice = computeSelectionPrice(gaItem, newQuantity, isMember);
      addedAmount = Math.max(0, newPrice - parseAmount(existing.priceCharged));
      await eventRegistrationItemSelectionRepository.update(existing.id, {
        quantity: newQuantity,
        priceCharged: String(newPrice),
      });
    } else {
      const price = computeSelectionPrice(gaItem, 1, isMember);
      addedAmount = price;
      await eventRegistrationItemSelectionRepository.create({
        registrationId,
        itemId: gaItem.id,
        itemName: gaItem.name,
        quantity: 1,
        priceCharged: String(price),
      });
    }
  }

  let updatedRegistration = registration;
  if (addedAmount > 0) {
    const newTotal = parseAmount(registration.totalPrice) + addedAmount;
    updatedRegistration = await eventItemRegistrationRepository.update(registrationId, { totalPrice: String(newTotal) });
    await registrationLedgerRepository.create({
      eventId: registration.eventId,
      participantId: registrationId,
      email: registration.contactEmail,
      type: 'edited',
      amount: String(addedAmount),
      note: `Walk-in attendee added at check-in${input.name ? ` (${input.name})` : ''} — $${addedAmount.toFixed(2)} due, collect offline`,
    });
  }

  logActivity({
    userEmail: registration.contactEmail,
    action: 'update',
    entityType: 'Check-in',
    entityId: registrationId,
    entityLabel: input.name || registration.contactName,
    description: 'Walk-in attendee added at check-in',
  });

  return { participant, registration: updatedRegistration };
}

/**
 * "Check in as a walk-in" — for someone with NO prior registration at all,
 * as opposed to addWalkInAttendee (which grows an existing one). Attendees
 * showing up unannounced are allowed; this creates a real registration on
 * the spot via the normal createItemsRegistration path — so it gets the
 * same pricing/capacity/ledger treatment as any other registration — then
 * immediately checks its one participant in, since the whole point of this
 * flow IS their check-in. If the event charges for General Attendance, the
 * registration is left unpaid (same offline-reconciliation approach as
 * addWalkInAttendee) for the front desk to settle and reconcile later.
 */
export async function createWalkInRegistration(eventId: string, input: { name: string; age?: string; email: string }) {
  const event = await requireItemsEvent(eventId);
  const catalog = parseItemCatalog(event.items);
  const gaItem = catalog.items.find((it) => it.isGeneralAttendance && it.enabled);

  const registration = await createItemsRegistration(eventId, {
    registrantType: 'Walk-in',
    attendeeCount: 1,
    contactName: input.name,
    contactEmail: input.email,
    participants: [{ name: input.name, age: input.age || '' }],
    itemSelections: gaItem ? [{ itemId: gaItem.id, quantity: 1 }] : [],
    paymentStatus: '',
    paymentMethod: '',
    transactionId: '',
  });
  if (!registration) throw new NotFoundError('Registration');

  const participants = await eventRegistrationParticipantRepository.findByRegistrationId(registration.id);
  if (participants[0]) {
    await checkinItemsParticipant(registration.id, participants[0].id);
  }

  const record = await eventItemRegistrationRepository.findById(registration.id);
  return record ? { ...record, participants: await eventRegistrationParticipantRepository.findByRegistrationId(registration.id) } : record;
}

// ========================================
// Cancellation & refunds
// ========================================

export async function cancelItemSelection(registrationId: string, itemSelectionId: string, opts: { reason?: string; sendEmail?: boolean }): Promise<{ selection: Record<string, string>; outcome: RefundOutcome }> {
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

  if (opts.sendEmail !== false && event) {
    const itemRefundMessage = amount > 0 ? describeRefundOutcome(outcome, 'This item') : undefined;
    try {
      const emailHtml = buildItemsRegistrationEmail({
        type: 'item_cancelled',
        eventName: event.name,
        eventDate: event.date,
        contactName: registration.contactName,
        registrationStatus: registration.registrationStatus,
        attendeeCount: parseInt(registration.attendeeCount || '1', 10),
        items: [{ label: selection.itemName, amount }],
        priceBreakdown: { lineItems: [], discounts: [], total: 0 },
        paymentStatus: registration.paymentStatus,
        paymentMethod: registration.paymentMethod,
        refundMessage: itemRefundMessage,
        eventHomeUrl: `${getAppUrl()}/events/${registration.eventId}/home`,
      });
      await sendEmail([registration.contactEmail], `Item Cancelled: ${event.name}`, emailHtml, 'system');
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Item cancellation email failed', registrationId, itemSelectionId } });
    }

    await sendAdminAlert({
      action: 'item_cancelled',
      eventCategory: event.category || '',
      eventName: event.name,
      eventDate: event.date,
      contactName: registration.contactName,
      contactEmail: registration.contactEmail,
      contactPhone: registration.contactPhone,
      registrationStatus: registration.registrationStatus,
      attendeeCount: parseInt(registration.attendeeCount || '1', 10),
      items: [{ label: selection.itemName, amount }],
      totalPrice: newTotal,
      paymentStatus: registration.paymentStatus,
      paymentMethod: registration.paymentMethod,
      refundMessage: itemRefundMessage,
      registrationId,
    });
  }

  return { selection: updated, outcome };
}

export async function cancelItemsRegistrationWithRefund(registrationId: string, opts: { reason?: string }) {
  const registration = await eventItemRegistrationRepository.findById(registrationId);
  if (!registration) throw new NotFoundError('Registration');

  const activeSelections = (await eventRegistrationItemSelectionRepository.findByRegistrationId(registrationId))
    .filter((s) => s.status !== 'cancelled');

  const cancelledItems: ItemsEmailLineItem[] = [];
  const outcomes: RefundOutcome[] = [];
  for (const sel of activeSelections) {
    const { outcome } = await cancelItemSelection(registrationId, sel.id, { reason: opts.reason || 'Registration cancelled', sendEmail: false });
    outcomes.push(outcome);
    cancelledItems.push({ label: sel.itemName, amount: parseAmount(sel.priceCharged) });
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

  const event = await eventRepository.findById(registration.eventId);
  if (event) {
    const combinedOutcome = combineRefundOutcomes(outcomes);
    const totalCancelledAmount = cancelledItems.reduce((sum, it) => sum + it.amount, 0);
    const cancelRefundMessage = totalCancelledAmount > 0 ? describeRefundOutcome(combinedOutcome, 'Your registration') : undefined;
    try {
      const emailHtml = buildItemsRegistrationEmail({
        type: 'cancelled',
        eventName: event.name,
        eventDate: event.date,
        contactName: registration.contactName,
        registrationStatus: 'cancelled',
        attendeeCount: parseInt(registration.attendeeCount || '1', 10),
        items: cancelledItems,
        priceBreakdown: { lineItems: [], discounts: [], total: 0 },
        paymentStatus: registration.paymentStatus,
        paymentMethod: registration.paymentMethod,
        refundMessage: cancelRefundMessage,
        eventHomeUrl: `${getAppUrl()}/events/${registration.eventId}/home`,
      });
      await sendEmail([registration.contactEmail], `Registration Cancelled: ${event.name}`, emailHtml, 'system');
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'Registration cancellation email failed', registrationId } });
    }

    await sendAdminAlert({
      action: 'cancelled',
      eventCategory: event.category || '',
      eventName: event.name,
      eventDate: event.date,
      contactName: registration.contactName,
      contactEmail: registration.contactEmail,
      contactPhone: registration.contactPhone,
      registrationStatus: 'cancelled',
      attendeeCount: parseInt(registration.attendeeCount || '1', 10),
      items: cancelledItems,
      totalPrice: totalCancelledAmount,
      paymentStatus: registration.paymentStatus,
      paymentMethod: registration.paymentMethod,
      refundMessage: cancelRefundMessage,
      registrationId,
    });
  }

  return { registration: updated, outcomes };
}

export const eventItemsService = {
  getItemsEventPublicDetail,
  createItemsRegistration,
  updateItemsRegistration,
  getItemsRegistrationsForEvent,
  checkinItemsParticipant,
  addWalkInAttendee,
  createWalkInRegistration,
  cancelItemSelection,
  cancelItemsRegistrationWithRefund,
};
