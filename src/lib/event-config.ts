import type { FormFieldConfig, ActivityConfig, ActivityPricingMode, GuestPolicy, ActivityRegistration } from '@/types';

// ========================================
// Event Configuration JSON Helpers
// ========================================

export const DEFAULT_GUEST_POLICY: GuestPolicy = {
  allowGuests: true,
  guestAction: 'pay_fee',
  guestMessage: '',
  allowGuestActivities: true,
};

export function parseGuestPolicy(json: string): GuestPolicy {
  if (!json) return { ...DEFAULT_GUEST_POLICY };
  try {
    const parsed = JSON.parse(json);
    return { ...DEFAULT_GUEST_POLICY, ...parsed };
  } catch {
    return { ...DEFAULT_GUEST_POLICY };
  }
}

export function parseFormConfig(json: string): FormFieldConfig[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseActivities(json: string): ActivityConfig[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    // New wrapper format: { maxSlots?: number, items: ActivityConfig[] }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) return parsed.items;
    // Legacy format: ActivityConfig[]
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Extract the event-level max performance slots cap from the activities JSON wrapper. */
export function parseActivityMaxSlots(json: string): number | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (parsed && !Array.isArray(parsed) && typeof parsed.maxSlots === 'number' && parsed.maxSlots > 0) {
      return parsed.maxSlots;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Serialize activities array + optional event-level maxSlots into a JSON string. */
export function serializeActivities(items: ActivityConfig[], maxSlots?: number): string {
  if (items.length === 0 && !maxSlots) return '';
  if (maxSlots) return JSON.stringify({ maxSlots, items });
  return JSON.stringify(items);
}

export function parseActivityPricingMode(value: string): ActivityPricingMode {
  if (value === 'per_activity') return 'per_activity';
  return 'flat';
}

/**
 * Parse activity registrations JSON with backward compatibility for old string[] format.
 */
export function parseActivityRegistrations(json: string): ActivityRegistration[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0) return [];
    // Detect old format: string[] of activity IDs (legacy — each ID gets its own slot)
    if (typeof parsed[0] === 'string') {
      return parsed.map((actId: string, i: number) => ({
        activityId: actId,
        participantName: '',
        slotId: `legacy_${actId}_${i}`,
      }));
    }
    // New format: ActivityRegistration[]
    return parsed;
  } catch {
    return [];
  }
}
