import type { FormFieldConfig, ActivityConfig, ActivityPricingMode, ActivityMode, GuestPolicy, ActivityRegistration, EventPaymentConfig } from '@/types';

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

/**
 * Extract the event's activity mode from the activities JSON wrapper.
 * Missing/legacy data (bare array, or wrapper without `mode`) defaults to
 * 'performance' — the pre-existing behavior — so old events are unaffected.
 */
export function parseActivityMode(json: string): ActivityMode {
  if (!json) return 'performance';
  try {
    const parsed = JSON.parse(json);
    if (parsed && !Array.isArray(parsed) && parsed.mode === 'ticketed_event') return 'ticketed_event';
    return 'performance';
  } catch {
    return 'performance';
  }
}

/**
 * Serialize activities array + optional event-level maxSlots/mode into a JSON string.
 * Ticketed events never carry a maxSlots cap — Event Capacity (per-adult/per-kid)
 * is their single source of truth — so any stale value is dropped here regardless
 * of what the caller passes, rather than relying on the UI to always clear it.
 */
export function serializeActivities(items: ActivityConfig[], maxSlots?: number, mode?: ActivityMode): string {
  const effectiveMaxSlots = mode === 'ticketed_event' ? undefined : maxSlots;
  const needsWrapper = !!effectiveMaxSlots || (!!mode && mode !== 'performance');
  if (items.length === 0 && !needsWrapper) return '';
  if (needsWrapper) return JSON.stringify({ mode, maxSlots: effectiveMaxSlots, items });
  return JSON.stringify(items);
}

// ========================================
// Activity Mode Labels
// ========================================
// Centralizes the user-facing copy that differs between 'performance' (named
// performers, chest numbers, co-performers sharing a slot) and 'ticketed_event'
// (one ticket per attendee, priced by tier, no chest numbers) so every screen
// that renders this copy stays in sync.

export interface ActivityLabels {
  sectionTitle: string;
  itemNoun: string;
  itemNounPlural: string;
  registrationNoun: string;
  registrationNounPlural: string;
  participantNoun: string;
  participantNounPlural: string;
  selectPlaceholder: string;
  registrationsTableTitle: string;
  enrollmentLabel: string;
  addButtonLabel: string;
  maxSlotsLabel: string;
  maxSlotsHelp: string;
  showChestNumbers: boolean;
  allowMultiplePerAttendee: boolean;
}

const PERFORMANCE_LABELS: ActivityLabels = {
  sectionTitle: 'Activities',
  itemNoun: 'Activity',
  itemNounPlural: 'Activities',
  registrationNoun: 'Performance',
  registrationNounPlural: 'Performances',
  participantNoun: 'Performer',
  participantNounPlural: 'Performers',
  selectPlaceholder: 'Select performance...',
  registrationsTableTitle: 'Performance Registrations',
  enrollmentLabel: 'Activity Enrollment',
  addButtonLabel: 'Add Activity',
  maxSlotsLabel: 'Max Registrations (Total Slots)',
  maxSlotsHelp: 'Total chest numbers allowed across all activities. Leave blank for unlimited.',
  showChestNumbers: true,
  allowMultiplePerAttendee: true,
};

const TICKETED_EVENT_LABELS: ActivityLabels = {
  sectionTitle: 'Ticket Tiers',
  itemNoun: 'Ticket Tier',
  itemNounPlural: 'Ticket Tiers',
  registrationNoun: 'Ticket',
  registrationNounPlural: 'Tickets',
  participantNoun: 'Attendee',
  participantNounPlural: 'Attendees',
  selectPlaceholder: 'Select ticket tier...',
  registrationsTableTitle: 'Ticket Registrations',
  enrollmentLabel: 'Ticket Sales',
  addButtonLabel: 'Add Ticket Tier',
  maxSlotsLabel: 'Max Tickets (Total)',
  maxSlotsHelp: 'Total tickets allowed across all tiers. Leave blank for unlimited.',
  showChestNumbers: false,
  allowMultiplePerAttendee: false,
};

export function getActivityLabels(mode: ActivityMode): ActivityLabels {
  return mode === 'ticketed_event' ? TICKETED_EVENT_LABELS : PERFORMANCE_LABELS;
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

// ========================================
// Per-Event Payment Options
// ========================================
// Stored outside the Event table, as a JSON blob in the generic `settings`
// key/value store (key = eventPaymentConfigKey(eventId)) rather than a new
// Prisma column — avoids a migration for a feature with only two fields.

export const DEFAULT_EVENT_PAYMENT_CONFIG: EventPaymentConfig = {
  paypalEnabled: true,
  zelleEnabled: false,
};

export function eventPaymentConfigKey(eventId: string): string {
  return `event_payment_config_${eventId}`;
}

export function parseEventPaymentConfig(json: string | null | undefined): EventPaymentConfig {
  if (!json) return { ...DEFAULT_EVENT_PAYMENT_CONFIG };
  try {
    const parsed = JSON.parse(json);
    return { ...DEFAULT_EVENT_PAYMENT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_EVENT_PAYMENT_CONFIG };
  }
}

export interface RegistrationFeatureFlags {
  selfServiceEditEnabled: boolean;
  cancelRefundEnabled: boolean;
}

/**
 * Resolve the self-service edit / cancel-refund feature flags for an event.
 * Plain per-event booleans — off unless the admin form has explicitly saved
 * `'true'` for this event (same pattern as registrationOpen/showOnPortal).
 */
export function resolveRegistrationFeatures(event: {
  selfServiceEditEnabled?: string;
  cancelRefundEnabled?: string;
}): RegistrationFeatureFlags {
  return {
    selfServiceEditEnabled: event.selfServiceEditEnabled === 'true',
    cancelRefundEnabled: event.cancelRefundEnabled === 'true',
  };
}
