import { settingRepository } from '@/repositories';
import type { PublicSettings, SocialLinks, FeeSettings, MembershipSettings, EventPaymentConfig } from '@/types';
import { DEFAULT_EVENT_PAYMENT_CONFIG, eventPaymentConfigKey, parseEventPaymentConfig } from '@/lib/event-config';

// ========================================
// Settings Service
// ========================================

export async function getSettings(): Promise<Record<string, string>> {
  return settingRepository.getAll();
}

export async function upsertBulk(
  settings: Record<string, string>,
  updatedBy: string,
): Promise<number> {
  const updates = Object.entries(settings);
  for (const [key, value] of updates) {
    await settingRepository.upsert(key, String(value), updatedBy);
  }
  return updates.length;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await settingRepository.getAll();

  const socialLinks: SocialLinks = {
    instagram: settings['social_instagram'] || '',
    facebook: settings['social_facebook'] || '',
    linkedin: settings['social_linkedin'] || '',
    youtube: settings['social_youtube'] || '',
  };

  const feeSettings: FeeSettings = {
    squareFeePercent: parseFloat(settings['fee_square_percent'] || '0'),
    squareFeeFixed: parseFloat(settings['fee_square_fixed'] || '0'),
    paypalFeePercent: parseFloat(settings['fee_paypal_percent'] || '0'),
    paypalFeeFixed: parseFloat(settings['fee_paypal_fixed'] || '0'),
    zelleEmail: settings['zelle_email'] || '',
    zellePhone: settings['zelle_phone'] || '',
  };

  const defaultTypes = JSON.stringify([
    { name: 'Family Membership', price: 125 },
    { name: 'Individual Membership', price: 75 },
    { name: 'Student Membership', price: 40 },
    { name: 'Life Membership', price: 1000 },
  ]);

  const parsedTypes = (() => { try { const t = JSON.parse(settings['membership_types'] || '[]'); return Array.isArray(t) && t.length > 0 ? t : null; } catch { return null; } })();
  const membershipSettings: MembershipSettings = {
    membershipTypes: parsedTypes || JSON.parse(defaultTypes),
    requiredApprovals: Math.max(1, parseInt(settings['membership_required_approvals'] || '3', 10)),
  };

  return { socialLinks, feeSettings, membershipSettings };
}

// ========================================
// Per-Event Payment Options
// ========================================

export async function getEventPaymentConfig(eventId: string): Promise<EventPaymentConfig> {
  const value = await settingRepository.get(eventPaymentConfigKey(eventId));
  return value ? parseEventPaymentConfig(value) : { ...DEFAULT_EVENT_PAYMENT_CONFIG };
}

export async function setEventPaymentConfig(
  eventId: string,
  config: EventPaymentConfig,
  updatedBy: string,
): Promise<void> {
  await settingRepository.upsert(eventPaymentConfigKey(eventId), JSON.stringify(config), updatedBy);
}

export async function deleteEventPaymentConfig(eventId: string): Promise<void> {
  await settingRepository.delete(eventPaymentConfigKey(eventId));
}
