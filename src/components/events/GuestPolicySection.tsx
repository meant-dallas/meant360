'use client';

import type { PricingRules, GuestPolicy, GuestAction } from '@/types';

interface GuestPolicySectionProps {
  pricing: PricingRules;
  guestPolicy: GuestPolicy;
  onPricingChange: (p: PricingRules) => void;
  onPolicyChange: (p: GuestPolicy) => void;
}

export default function GuestPolicySection({ pricing, guestPolicy, onPricingChange, onPolicyChange }: GuestPolicySectionProps) {
  const updatePolicy = (partial: Partial<GuestPolicy>) => {
    onPolicyChange({ ...guestPolicy, ...partial });
  };

  const updatePricing = (partial: Partial<PricingRules>) => {
    onPricingChange({ ...pricing, ...partial });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={guestPolicy.allowGuests}
          onChange={(e) => updatePolicy({ allowGuests: e.target.checked })}
          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Guests</span>
      </label>

      {guestPolicy.allowGuests && (
        <div className="space-y-3 pl-1">
          <div>
            <label className="label">Guest Action</label>
            <div className="space-y-2">
              {([
                { value: 'pay_fee', label: 'Pay guest fee' },
                { value: 'become_member', label: 'Must become member' },
              ] as { value: GuestAction; label: string }[]).map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="guestAction"
                    value={opt.value}
                    checked={guestPolicy.guestAction === opt.value}
                    onChange={() => updatePolicy({ guestAction: opt.value })}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {guestPolicy.guestAction === 'pay_fee' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Guest Pricing</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Adult Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.guestAdultPrice}
                    onChange={(e) => updatePricing({ guestAdultPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Kid Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.guestKidPrice}
                    onChange={(e) => updatePricing({ guestKidPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Kids Free &le; Age</label>
                  <input
                    type="number"
                    min={0}
                    value={pricing.guestKidFreeUnderAge}
                    onChange={(e) => updatePricing({ guestKidFreeUnderAge: parseInt(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Kid Max Age</label>
                  <input
                    type="number"
                    min={0}
                    value={pricing.guestKidMaxAge}
                    onChange={(e) => updatePricing({ guestKidMaxAge: parseInt(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label">Custom Message (optional)</label>
            <textarea
              value={guestPolicy.guestMessage || ''}
              onChange={(e) => updatePolicy({ guestMessage: e.target.value })}
              className="input"
              rows={2}
              placeholder="Message shown to guests..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
