import { settingRepository } from '@/repositories';
import type { PublicSettings, SocialLinks, FeeSettings, MembershipSettings } from '@/types';

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
  };

  const membershipSettings: MembershipSettings = {
    yearlyCost: parseFloat(settings['membership_yearly_cost'] || '0'),
  };

  return { socialLinks, feeSettings, membershipSettings };
}
