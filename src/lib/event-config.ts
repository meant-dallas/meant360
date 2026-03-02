import type { FormFieldConfig, ActivityConfig, ActivityPricingMode, GuestPolicy, ActivityRegistration } from '@/types';

// ========================================
// Event Configuration JSON Helpers
// ========================================

export const DEFAULT_GUEST_POLICY: GuestPolicy = {
  allowGuests: true,
  guestAction: 'pay_fee',
  guestMessage: '',
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    // Detect old format: string[] of activity IDs
    if (typeof parsed[0] === 'string') {
      return parsed.map((actId: string) => ({ activityId: actId, participantName: '' }));
    }
    // New format: ActivityRegistration[]
    return parsed;
  } catch {
    return [];
  }
}
