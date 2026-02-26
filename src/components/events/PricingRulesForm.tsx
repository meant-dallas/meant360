'use client';

import type { PricingRules, PricingModel } from '@/types';

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
          <div>
            <label className="label">Pricing Model</label>
            <select
              value={pricing.model}
              onChange={(e) => update({ model: e.target.value as PricingModel })}
              className="select"
            >
              <option value="per_family">Per Family</option>
              <option value="per_person">Per Person</option>
              <option value="free">Free</option>
            </select>
          </div>

          {pricing.model !== 'free' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Member Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.memberPrice}
                    onChange={(e) => update({ memberPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Guest Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.guestPrice}
                    onChange={(e) => update({ guestPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Kid Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing.kidPrice}
                    onChange={(e) => update({ kidPrice: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Kids Free Under Age</label>
                  <input
                    type="number"
                    min={0}
                    value={pricing.kidsFreeUnderAge}
                    onChange={(e) => update({ kidsFreeUnderAge: parseInt(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>

              {/* Multi-Person Discount */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pricing.multiPersonDiscount.enabled}
                    onChange={(e) =>
                      update({ multiPersonDiscount: { ...pricing.multiPersonDiscount, enabled: e.target.checked } })
                    }
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Multi-Person Discount</span>
                </label>
                {pricing.multiPersonDiscount.enabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Min People</label>
                      <input
                        type="number"
                        min={2}
                        value={pricing.multiPersonDiscount.minPeople}
                        onChange={(e) =>
                          update({ multiPersonDiscount: { ...pricing.multiPersonDiscount, minPeople: parseInt(e.target.value) || 2 } })
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Type</label>
                      <select
                        value={pricing.multiPersonDiscount.type}
                        onChange={(e) =>
                          update({ multiPersonDiscount: { ...pricing.multiPersonDiscount, type: e.target.value as 'flat' | 'percent' } })
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
                        value={pricing.multiPersonDiscount.value}
                        onChange={(e) =>
                          update({ multiPersonDiscount: { ...pricing.multiPersonDiscount, value: parseFloat(e.target.value) || 0 } })
                        }
                        className="input"
                      />
                    </div>
                  </div>
                )}
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
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Min Kids</label>
                      <input
                        type="number"
                        min={2}
                        value={pricing.siblingDiscount.minKids}
                        onChange={(e) =>
                          update({ siblingDiscount: { ...pricing.siblingDiscount, minKids: parseInt(e.target.value) || 2 } })
                        }
                        className="input"
                      />
                    </div>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
