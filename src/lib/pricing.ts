import type { PricingRules, MemberPricingModel, PriceBreakdown, PriceLineItem, ActivityConfig, ActivityPricingMode, ActivityRegistration } from '@/types';

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

function applyDiscount(base: number, type: 'flat' | 'percent', value: number): number {
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
    for (const reg of selectedActivities as ActivityRegistration[]) {
      const activity = activities.find((a) => a.id === reg.activityId);
      if (activity && activity.price && activity.price > 0) {
        const label = reg.participantName
          ? `${activity.name} (${reg.participantName})`
          : activity.name;
        activityItems.push({ label, amount: activity.price });
      }
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
