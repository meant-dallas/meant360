import type { PricingRules, DiscountRules, MemberPricingModel, PriceBreakdown, PriceLineItem, ActivityConfig, ActivityPricingMode, ActivityRegistration, ItemPricingMode } from '@/types';

export const DEFAULT_PRICING_RULES: PricingRules = {
  enabled: false,
  memberPricingModel: 'family',
  memberFamilyPrice: 0,
  memberAdultPrice: 0,
  memberKidPrice: 0,
  memberKidFreeUnderAge: 5,
  memberKidMaxAge: 17,
  guestAdultPrice: 0,
  guestKidPrice: 0,
  guestKidFreeUnderAge: 5,
  guestKidMaxAge: 17,
  siblingDiscount: { enabled: false, type: 'flat', value: 0 },
  multiEventDiscount: { enabled: false, minEvents: 2, type: 'flat', value: 0 },
  earlyBirdDiscount: { enabled: false, type: 'flat', value: 0, endDate: '' },
};

export function parsePricingRules(json: string): PricingRules {
  if (!json) return { ...DEFAULT_PRICING_RULES };
  try {
    const parsed = JSON.parse(json);

    // Backward-compatible migration from old format
    if ('model' in parsed || 'memberPrice' in parsed || 'guestPrice' in parsed) {
      const oldModel: string = parsed.model || 'per_family';
      const memberPricingModel: MemberPricingModel =
        oldModel === 'per_family' ? 'family' : 'individual';

      const memberPrice = parsed.memberPrice ?? 0;
      const guestPrice = parsed.guestPrice ?? 0;
      const kidPrice = parsed.kidPrice ?? 0;
      const kidsFreeUnderAge = parsed.kidsFreeUnderAge ?? 5;

      const migrated: PricingRules = {
        enabled: parsed.enabled ?? false,
        memberPricingModel,
        memberFamilyPrice: memberPrice,
        memberAdultPrice: memberPrice,
        memberKidPrice: kidPrice,
        memberKidFreeUnderAge: kidsFreeUnderAge,
        memberKidMaxAge: 17,
        guestAdultPrice: guestPrice,
        guestKidPrice: kidPrice,
        guestKidFreeUnderAge: kidsFreeUnderAge,
        guestKidMaxAge: 17,
        siblingDiscount: parsed.siblingDiscount
          ? { enabled: parsed.siblingDiscount.enabled, type: parsed.siblingDiscount.type, value: parsed.siblingDiscount.value }
          : DEFAULT_PRICING_RULES.siblingDiscount,
        multiEventDiscount: parsed.multiEventDiscount ?? DEFAULT_PRICING_RULES.multiEventDiscount,
        earlyBirdDiscount: parsed.earlyBirdDiscount ?? DEFAULT_PRICING_RULES.earlyBirdDiscount,
      };

      // If old model was 'free', disable pricing
      if (oldModel === 'free') {
        migrated.enabled = false;
      }

      return migrated;
    }

    // New format — merge with defaults
    return {
      ...DEFAULT_PRICING_RULES,
      ...parsed,
      siblingDiscount: parsed.siblingDiscount ?? DEFAULT_PRICING_RULES.siblingDiscount,
      multiEventDiscount: parsed.multiEventDiscount ?? DEFAULT_PRICING_RULES.multiEventDiscount,
      earlyBirdDiscount: parsed.earlyBirdDiscount ?? DEFAULT_PRICING_RULES.earlyBirdDiscount,
    };
  } catch {
    return { ...DEFAULT_PRICING_RULES };
  }
}

interface CalculatePriceInput {
  pricingRules: PricingRules;
  type: 'Member' | 'Guest';
  adults: number;
  freeKids: number;
  paidKids: number;
  otherSubEventCount: number;
  registrationDate?: string; // ISO date (YYYY-MM-DD) for early bird check
}

export function applyDiscount(base: number, type: 'flat' | 'percent', value: number): number {
  if (type === 'percent') {
    return base * (value / 100);
  }
  return value;
}

export function calculatePrice(input: CalculatePriceInput): PriceBreakdown {
  const { pricingRules, type, adults, freeKids, paidKids, otherSubEventCount, registrationDate } = input;

  // If pricing is disabled globally, guests can still have pricing via guest policy
  if (!pricingRules.enabled) {
    if (type === 'Guest' && (pricingRules.guestAdultPrice > 0 || pricingRules.guestKidPrice > 0)) {
      // Fall through to calculate guest pricing
    } else {
      return { lineItems: [], subtotal: 0, discounts: [], total: 0 };
    }
  }

  const lineItems: PriceLineItem[] = [];
  const discounts: PriceLineItem[] = [];

  if (type === 'Member' && pricingRules.memberPricingModel === 'family') {
    // Member family: one flat price
    lineItems.push({ label: 'Family', amount: pricingRules.memberFamilyPrice });
    if (freeKids > 0) {
      lineItems.push({ label: `Kids free (${freeKids})`, amount: 0 });
    }
  } else if (type === 'Member') {
    // Member individual
    if (adults > 0) {
      lineItems.push({ label: `Adults (${adults})`, amount: pricingRules.memberAdultPrice * adults });
    }
    if (paidKids > 0) {
      lineItems.push({ label: `Kids (${paidKids})`, amount: pricingRules.memberKidPrice * paidKids });
    }
    if (freeKids > 0) {
      lineItems.push({ label: `Kids free (${freeKids})`, amount: 0 });
    }
  } else {
    // Guest — always individual
    if (adults > 0) {
      lineItems.push({ label: `Adults (${adults})`, amount: pricingRules.guestAdultPrice * adults });
    }
    if (paidKids > 0) {
      lineItems.push({ label: `Kids (${paidKids})`, amount: pricingRules.guestKidPrice * paidKids });
    }
    if (freeKids > 0) {
      lineItems.push({ label: `Kids free (${freeKids})`, amount: 0 });
    }
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // Sibling discount: applied to paidKids - 1, not for family model
  const sd = pricingRules.siblingDiscount;
  const isFamilyMember = type === 'Member' && pricingRules.memberPricingModel === 'family';
  if (sd.enabled && !isFamilyMember && paidKids >= 2) {
    const kidPrice = type === 'Member' ? pricingRules.memberKidPrice : pricingRules.guestKidPrice;
    const perKidDiscount = applyDiscount(kidPrice, sd.type, sd.value);
    const additionalKids = paidKids - 1;
    const discount = perKidDiscount * additionalKids;
    discounts.push({
      label: `Sibling discount (${additionalKids} extra kid${additionalKids > 1 ? 's' : ''})`,
      amount: -discount,
    });
  }

  // Multi-event discount: applied to running total (subtotal + sibling discount)
  const med = pricingRules.multiEventDiscount;
  if (med.enabled && otherSubEventCount + 1 >= med.minEvents) {
    const runningTotal = subtotal + discounts.reduce((sum, d) => sum + d.amount, 0);
    const discount = applyDiscount(runningTotal, med.type, med.value);
    discounts.push({
      label: `Multi-event discount (${otherSubEventCount + 1} events)`,
      amount: -discount,
    });
  }

  // Early bird discount: applied to running total if registration is before end date
  const ebd = pricingRules.earlyBirdDiscount;
  if (ebd?.enabled && ebd.endDate) {
    const regDate = registrationDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    if (regDate <= ebd.endDate) {
      const runningTotal = subtotal + discounts.reduce((sum, d) => sum + d.amount, 0);
      const discount = applyDiscount(runningTotal, ebd.type, ebd.value);
      discounts.push({
        label: `Early bird discount (before ${ebd.endDate})`,
        amount: -discount,
      });
    }
  }

  const totalDiscounts = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal + totalDiscounts);

  return { lineItems, subtotal, discounts, total };
}

/**
 * Reconstruct the free/paid kids split from a stored attendeeNames JSON array
 * (format: "Name (age N)" for kid entries appended after the adult entries),
 * classifying each kid against the free-under-age threshold. Used to recompute
 * a registration's canonical price without a separate stored free/paid split.
 *
 * Returns null when the split can't be reliably determined (missing/malformed
 * data, or the number of parsed kid entries doesn't match kidsCount) — callers
 * should treat that as "can't validate" rather than guessing, since a wrong
 * guess here would produce a false-positive price mismatch.
 */
export function deriveKidsSplitFromAttendeeNames(
  attendeeNamesJson: string,
  adultsCount: number,
  kidsCount: number,
  kidFreeAge: number,
): { freeKids: number; paidKids: number } | null {
  if (kidsCount <= 0) return { freeKids: 0, paidKids: 0 };
  if (!attendeeNamesJson) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(attendeeNamesJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const kidEntries = parsed.slice(adultsCount);
  if (kidEntries.length !== kidsCount) return null;

  let freeKids = 0;
  let paidKids = 0;
  for (const entry of kidEntries) {
    const match = String(entry).match(/\(age\s*(\d+)\)\s*$/);
    if (!match) return null;
    const age = parseInt(match[1], 10);
    if (age <= kidFreeAge) freeKids++;
    else paidKids++;
  }
  return { freeKids, paidKids };
}

export function formatPricingSummary(rules: PricingRules): string {
  if (!rules.enabled) return 'Free';
  if (rules.memberPricingModel === 'family') return `$${rules.memberFamilyPrice}/family`;
  return `$${rules.memberAdultPrice}/adult`;
}

/**
 * Calculate additional activity pricing and merge with base price breakdown.
 * Accepts both old format (string[] of activity IDs) and new format (ActivityRegistration[]).
 * When activityPricingMode is 'per_activity', applies multi-event discount based on
 * the number of priced activities selected.
 */
export function calculateActivityPrice(
  baseBreakdown: PriceBreakdown,
  activities: ActivityConfig[],
  selectedActivities: string[] | ActivityRegistration[],
  activityPricingMode: ActivityPricingMode,
  pricingRules?: PricingRules,
): PriceBreakdown {
  if (activityPricingMode !== 'per_activity' || selectedActivities.length === 0) {
    return baseBreakdown;
  }

  const activityItems: PriceLineItem[] = [];

  // Detect format
  const isNewFormat = typeof selectedActivities[0] === 'object';

  if (isNewFormat) {
    // Group registrations by slotId — each slot is an independent performance registration.
    // Within a slot: first participant pays activity.price, additional pay additionalParticipantPrice.
    const slotEntries = new Map<string, { activity: ActivityConfig; participants: string[] }>();
    const slotOrder: string[] = [];
    for (const reg of selectedActivities as ActivityRegistration[]) {
      const activity = activities.find((a) => a.id === reg.activityId);
      if (!activity || !activity.price || activity.price <= 0) continue;
      const slotKey = reg.slotId || reg.activityId; // fallback for legacy data without slotId
      if (!slotEntries.has(slotKey)) {
        slotEntries.set(slotKey, { activity, participants: [] });
        slotOrder.push(slotKey);
      }
      slotEntries.get(slotKey)!.participants.push(reg.participantName);
    }
    for (const slotKey of slotOrder) {
      const { activity, participants } = slotEntries.get(slotKey)!;
      const basePrice = activity.price!;
      const addlPrice = activity.additionalParticipantPrice ?? basePrice;
      participants.forEach((name, i) => {
        const label = name ? `${activity.name} (${name})` : activity.name;
        activityItems.push({ label, amount: i === 0 ? basePrice : addlPrice });
      });
    }
  } else {
    for (const actId of selectedActivities as string[]) {
      const activity = activities.find((a) => a.id === actId);
      if (activity && activity.price && activity.price > 0) {
        activityItems.push({ label: activity.name, amount: activity.price });
      }
    }
  }

  if (activityItems.length === 0) return baseBreakdown;

  const activityTotal = activityItems.reduce((sum, item) => sum + item.amount, 0);
  const combinedSubtotal = baseBreakdown.subtotal + activityTotal;
  const discounts = [...baseBreakdown.discounts];

  // Multi-activity discount: treat each priced activity as an "event" for multi-event discount
  const pricedActivityCount = activityItems.length;
  const med = pricingRules?.multiEventDiscount;
  if (med?.enabled && pricedActivityCount >= med.minEvents) {
    const runningTotal = combinedSubtotal + discounts.reduce((sum, d) => sum + d.amount, 0);
    const discount = applyDiscount(runningTotal, med.type, med.value);
    discounts.push({
      label: `Multi-activity discount (${pricedActivityCount} activities)`,
      amount: -discount,
    });
  }

  const totalDiscounts = discounts.reduce((sum, d) => sum + d.amount, 0);

  return {
    lineItems: [...baseBreakdown.lineItems, ...activityItems],
    subtotal: combinedSubtotal,
    discounts,
    total: Math.max(0, combinedSubtotal + totalDiscounts),
  };
}

export interface ItemPriceInput {
  itemId: string;
  itemName: string;
  pricingMode: ItemPricingMode;
  unitPrice: number; // member or guest price, already resolved by the caller
  quantity: number;
  amount: number; // pre-discount charge for this selection (unitPrice, or unitPrice * quantity for non-flat modes)
  isGeneralAttendance?: boolean;
  /**
   * Which EntryTypeConfig this selection is (Activity items only). Two entry
   * types on the SAME catalog item (e.g. "Olympiad"'s Maths vs Science) are
   * different activities for discount purposes, same as two different
   * catalog items — so sibling/multi-event grouping below keys on
   * itemId+entryTypeKey, not itemId alone.
   */
  entryTypeKey?: string;
  /**
   * Named people this selection charges for (Activity entries only). Drives
   * both discount checks below — omit for Standard items with no roster:
   * they're excluded from sibling/multi-event (we can't tell if N units are
   * N different people or one person buying N), but still ride along in the
   * discounted running total once one of the two discounts applies.
   */
  participantNames?: string[];
}

/**
 * Discount-aware total for the generic Items registration model.
 *
 * Sibling and multi-event discounts are mutually exclusive per registration
 * — whichever computes to the larger dollar amount wins — and both are
 * detected from participant identity rather than raw row/quantity counts:
 * - Sibling: 2+ *different* named people entered on the *same* catalog item
 *   (e.g. Child 1 and Child 2 both doing "Maths"). The discount applies to
 *   every participant beyond the first, at that participant's own price.
 * - Multi-event: one named person entered across 2+ *different* catalog
 *   items (e.g. Child 1 doing "Maths" and "Science"). Applies as a percent/
 *   flat cut of the whole running total, same as before.
 * General Attendance never feeds either check (it's plain attendance, not
 * "an activity" to stack against) but remains early-bird eligible.
 * Early bird always stacks on top of whichever of the two (if either) won.
 */
// A flat-priced item is always exactly one unit, so quantity never applies
// to it — only per_unit/per_participant items multiply, and only when more
// than one unit was actually selected. Shared by every place that recaps a
// selection (price breakdown, on-page "what you submitted" summaries, and
// the confirmation email) so they all agree on the same "(xN)" format.
export function itemLabelWithQuantity(itemName: string, quantity: number, pricingMode: ItemPricingMode | string): string {
  return quantity > 1 && pricingMode !== 'flat' ? `${itemName} (x${quantity})` : itemName;
}

export function calculateItemsPrice(
  selections: ItemPriceInput[],
  discountRules: DiscountRules,
  registrationDate?: string,
): PriceBreakdown {
  const lineItems: PriceLineItem[] = [];
  for (const sel of selections) {
    const label = itemLabelWithQuantity(sel.itemName, sel.quantity, sel.pricingMode);
    lineItems.push({ label, amount: sel.amount });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const discounts: PriceLineItem[] = [];

  // Only named, priced, non-GA selections carry enough identity to feed
  // sibling/multi-event detection.
  const eligible = selections.filter(
    (s) => !s.isGeneralAttendance && s.amount > 0 && s.participantNames && s.participantNames.length > 0
  );

  // --- Sibling candidate: 2+ distinct people on the same item ---
  const sd = discountRules.siblingDiscount;
  let siblingAmount = 0;
  const siblingLines: PriceLineItem[] = [];
  if (sd.enabled) {
    const byItem = new Map<string, { itemName: string; slots: { name: string; unitPrice: number }[] }>();
    for (const sel of eligible) {
      const groupKey = sel.entryTypeKey ? `${sel.itemId}::${sel.entryTypeKey}` : sel.itemId;
      const names = sel.participantNames!;
      const perPersonPrice = names.length > 0 ? sel.amount / names.length : sel.amount;
      const entry = byItem.get(groupKey) || { itemName: sel.itemName, slots: [] };
      for (const name of names) entry.slots.push({ name, unitPrice: perPersonPrice });
      byItem.set(groupKey, entry);
    }
    for (const { itemName, slots } of Array.from(byItem.values())) {
      const distinctNames = new Set(slots.map((s) => s.name.trim().toLowerCase()).filter(Boolean));
      if (distinctNames.size < 2) continue;
      // First (highest-priced) slot pays full price; every extra participant is discounted.
      const extras = [...slots].sort((a, b) => b.unitPrice - a.unitPrice).slice(1);
      const amount = extras.reduce((sum, s) => sum + applyDiscount(s.unitPrice, sd.type, sd.value), 0);
      if (amount > 0) {
        siblingAmount += amount;
        siblingLines.push({ label: `Sibling discount (${itemName}, ${extras.length} extra)`, amount: -amount });
      }
    }
  }

  // --- Multi-event candidate: one person spread across 2+ different items ---
  const med = discountRules.multiEventDiscount;
  let multiEventAmount = 0;
  let multiEventLine: PriceLineItem | null = null;
  if (med.enabled) {
    const itemsByPerson = new Map<string, Set<string>>();
    for (const sel of eligible) {
      for (const name of sel.participantNames!) {
        const key = name.trim().toLowerCase();
        if (!key) continue;
        const groupKey = sel.entryTypeKey ? `${sel.itemId}::${sel.entryTypeKey}` : sel.itemId;
        const set = itemsByPerson.get(key) || new Set<string>();
        set.add(groupKey);
        itemsByPerson.set(key, set);
      }
    }
    const maxEventsForOnePerson = Math.max(0, ...Array.from(itemsByPerson.values()).map((set) => set.size));
    if (maxEventsForOnePerson >= med.minEvents) {
      const discount = applyDiscount(subtotal, med.type, med.value);
      if (discount > 0) {
        multiEventAmount = discount;
        multiEventLine = { label: `Multi-event discount (${maxEventsForOnePerson} events)`, amount: -discount };
      }
    }
  }

  // --- Mutually exclusive: whichever discount is bigger wins ---
  if (siblingAmount > 0 && siblingAmount >= multiEventAmount) {
    discounts.push(...siblingLines);
  } else if (multiEventLine) {
    discounts.push(multiEventLine);
  }

  // Early bird discount: applied to running total if registration is before end date.
  // Always independent — stacks on top of whichever (if either) discount above won,
  // and applies even to registrations with no activities at all (General Attendance only).
  const ebd = discountRules.earlyBirdDiscount;
  if (ebd?.enabled && ebd.endDate) {
    const regDate = registrationDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    if (regDate <= ebd.endDate) {
      const runningTotal = subtotal + discounts.reduce((sum, d) => sum + d.amount, 0);
      const discount = applyDiscount(runningTotal, ebd.type, ebd.value);
      discounts.push({
        label: `Early bird discount (before ${ebd.endDate})`,
        amount: -discount,
      });
    }
  }

  const totalDiscounts = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal + totalDiscounts);

  return { lineItems, subtotal, discounts, total };
}
