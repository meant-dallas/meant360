'use client';

import type { EventPaymentConfig } from '@/types';

interface PaymentOptionsSectionProps {
  paymentConfig: EventPaymentConfig;
  onChange: (config: EventPaymentConfig) => void;
}

export default function PaymentOptionsSection({ paymentConfig, onChange }: PaymentOptionsSectionProps) {
  const update = (partial: Partial<EventPaymentConfig>) => {
    onChange({ ...paymentConfig, ...partial });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Choose which payment options registrants can use for this event. Square remains available via admin check-in regardless of these settings.
      </p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={paymentConfig.paypalEnabled}
          onChange={(e) => update({ paypalEnabled: e.target.checked })}
          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow PayPal</span>
      </label>

      {paymentConfig.paypalEnabled && (
        <div className="grid grid-cols-2 gap-3 pl-1">
          <div>
            <label className="label">PayPal Fee % <span className="text-xs font-normal text-gray-400">(optional override)</span></label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={paymentConfig.paypalFeePercent ?? ''}
              onChange={(e) => update({ paypalFeePercent: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="Uses global default"
            />
          </div>
          <div>
            <label className="label">PayPal Fixed Fee ($) <span className="text-xs font-normal text-gray-400">(optional override)</span></label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={paymentConfig.paypalFeeFixed ?? ''}
              onChange={(e) => update({ paypalFeeFixed: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="Uses global default"
            />
          </div>
          <p className="col-span-2 text-xs text-gray-500 dark:text-gray-400">
            Leave blank to use the org-wide PayPal fee from Settings. Only fill these in if this event&apos;s PayPal fee is different — enter <span className="font-medium">0</span> if this event should have no PayPal fee at all.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={paymentConfig.zelleEnabled}
          onChange={(e) => update({ zelleEnabled: e.target.checked })}
          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Zelle</span>
      </label>

      {!paymentConfig.paypalEnabled && !paymentConfig.zelleEnabled && (
        <p className="text-xs text-red-600 dark:text-red-400">
          At least one payment option must be enabled, or registrants will have no way to pay online.
        </p>
      )}
    </div>
  );
}
