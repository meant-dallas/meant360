'use client';

import type { PricingRules, MemberPricingModel } from '@/types';

interface PricingRulesFormProps {
  pricing: PricingRules;
  onChange: (pricing: PricingRules) => void;
}

export default function PricingRulesForm({ pricing, onChange }: PricingRulesFormProps) {
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
        <div className="space-y-4 pl-1">
          {/* Member Pricing */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Member Pricing</h4>
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
                    <label className="label">Kids Free ≤ Age</label>
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

          {/* Guest Pricing */}
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
                  onChange={(e) => update({ guestAdultPrice: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => update({ guestKidPrice: parseFloat(e.target.value) || 0 })}
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Kids Free ≤ Age</label>
                <input
                  type="number"
                  min={0}
                  value={pricing.guestKidFreeUnderAge}
                  onChange={(e) => update({ guestKidFreeUnderAge: parseInt(e.target.value) || 0 })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Kid Max Age</label>
                <input
                  type="number"
                  min={0}
                  value={pricing.guestKidMaxAge}
                  onChange={(e) => update({ guestKidMaxAge: parseInt(e.target.value) || 0 })}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Sibling Discount */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pricing.siblingDiscount.enabled}
                onChange={(e) =>
                  update({ siblingDiscount: { ...pricing.siblingDiscount, enabled: e.target.checked } })
                }
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sibling Discount</span>
            </label>
            {pricing.siblingDiscount.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select
                    value={pricing.siblingDiscount.type}
                    onChange={(e) =>
                      update({ siblingDiscount: { ...pricing.siblingDiscount, type: e.target.value as 'flat' | 'percent' } })
                    }
                    className="select"
                  >
                    <option value="flat">Flat ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.siblingDiscount.value}
                    onChange={(e) =>
                      update({ siblingDiscount: { ...pricing.siblingDiscount, value: parseFloat(e.target.value) || 0 } })
                    }
                    className="input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Multi-Event Discount */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pricing.multiEventDiscount.enabled}
                onChange={(e) =>
                  update({ multiEventDiscount: { ...pricing.multiEventDiscount, enabled: e.target.checked } })
                }
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Multi-Event Discount</span>
            </label>
            {pricing.multiEventDiscount.enabled && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Min Events</label>
                  <input
                    type="number"
                    min={2}
                    value={pricing.multiEventDiscount.minEvents}
                    onChange={(e) =>
                      update({ multiEventDiscount: { ...pricing.multiEventDiscount, minEvents: parseInt(e.target.value) || 2 } })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select
                    value={pricing.multiEventDiscount.type}
                    onChange={(e) =>
                      update({ multiEventDiscount: { ...pricing.multiEventDiscount, type: e.target.value as 'flat' | 'percent' } })
                    }
                    className="select"
                  >
                    <option value="flat">Flat ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.multiEventDiscount.value}
                    onChange={(e) =>
                      update({ multiEventDiscount: { ...pricing.multiEventDiscount, value: parseFloat(e.target.value) || 0 } })
                    }
                    className="input"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
