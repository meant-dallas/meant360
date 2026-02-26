import { getAllSettings, upsertSetting } from '@/lib/google-sheets';
import type { PublicSettings, SocialLinks, FeeSettings } from '@/types';

// ========================================
// Settings Service
// ========================================

export async function getSettings(): Promise<Record<string, string>> {
  return getAllSettings();
}

export async function upsertBulk(
  settings: Record<string, string>,
  updatedBy: string,
): Promise<number> {
  const updates = Object.entries(settings);
  for (const [key, value] of updates) {
    await upsertSetting(key, String(value), updatedBy);
  }
  return updates.length;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await getAllSettings();

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

  return { socialLinks, feeSettings };
}
