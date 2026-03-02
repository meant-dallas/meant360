'use client';

import type { PricingRules, MemberPricingModel } from '@/types';

interface MemberPolicyFormProps {
  pricing: PricingRules;
  onChange: (pricing: PricingRules) => void;
}

export default function MemberPolicyForm({ pricing, onChange }: MemberPolicyFormProps) {
  const update = (partial: Partial<PricingRules>) => {
    onChange({ ...pricing, ...partial });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={pricing.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Pricing</span>
      </label>

      {pricing.enabled && (
        <div className="space-y-3 pl-1">
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="memberPricingModel"
                value="family"
                checked={pricing.memberPricingModel === 'family'}
                onChange={() => update({ memberPricingModel: 'family' as MemberPricingModel })}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Family</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="memberPricingModel"
                value="individual"
                checked={pricing.memberPricingModel === 'individual'}
                onChange={() => update({ memberPricingModel: 'individual' as MemberPricingModel })}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Individual</span>
            </label>
          </div>

          {pricing.memberPricingModel === 'family' ? (
            <div>
              <label className="label">Family Price ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={pricing.memberFamilyPrice}
                onChange={(e) => update({ memberFamilyPrice: parseFloat(e.target.value) || 0 })}
                className="input"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Adult Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.memberAdultPrice}
                    onChange={(e) => update({ memberAdultPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Kid Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.memberKidPrice}
                    onChange={(e) => update({ memberKidPrice: parseFloat(e.target.value) || 0 })}
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
                    value={pricing.memberKidFreeUnderAge}
                    onChange={(e) => update({ memberKidFreeUnderAge: parseInt(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Kid Max Age</label>
                  <input
                    type="number"
                    min={0}
                    value={pricing.memberKidMaxAge}
                    onChange={(e) => update({ memberKidMaxAge: parseInt(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
