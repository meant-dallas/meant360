'use client';

import type { PricingRules } from '@/types';

interface DiscountsFormProps {
  pricing: PricingRules;
  onChange: (pricing: PricingRules) => void;
}

export default function DiscountsForm({ pricing, onChange }: DiscountsFormProps) {
  const update = (partial: Partial<PricingRules>) => {
    onChange({ ...pricing, ...partial });
  };

  return (
    <div className="space-y-4">
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
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Multi-Activity Discount</span>
        </label>
        {pricing.multiEventDiscount.enabled && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Min Activities</label>
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

      {/* Early Bird Discount */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pricing.earlyBirdDiscount?.enabled ?? false}
            onChange={(e) =>
              update({ earlyBirdDiscount: { ...pricing.earlyBirdDiscount ?? { type: 'flat', value: 0, endDate: '' }, enabled: e.target.checked } })
            }
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Early Bird Discount</span>
        </label>
        {pricing.earlyBirdDiscount?.enabled && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Type</label>
              <select
                value={pricing.earlyBirdDiscount.type}
                onChange={(e) =>
                  update({ earlyBirdDiscount: { ...pricing.earlyBirdDiscount, type: e.target.value as 'flat' | 'percent' } })
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
                value={pricing.earlyBirdDiscount.value}
                onChange={(e) =>
                  update({ earlyBirdDiscount: { ...pricing.earlyBirdDiscount, value: parseFloat(e.target.value) || 0 } })
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                value={pricing.earlyBirdDiscount.endDate}
                onChange={(e) =>
                  update({ earlyBirdDiscount: { ...pricing.earlyBirdDiscount, endDate: e.target.value } })
                }
                className="input"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
