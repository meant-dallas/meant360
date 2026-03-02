'use client';

import type { ActivityConfig, ActivityPricingMode, ActivityRegistration } from '@/types';
import { HiOutlineXMark } from 'react-icons/hi2';

interface ActivitySelectorProps {
  activities: ActivityConfig[];
  registrations: ActivityRegistration[];
  activityPricingMode: ActivityPricingMode;
  onChange: (registrations: ActivityRegistration[]) => void;
}

export default function ActivitySelector({ activities, registrations, activityPricingMode, onChange }: ActivitySelectorProps) {
  if (activities.length === 0) return null;

  // Ensure there's always at least one entry row
  const entries = registrations.length > 0 ? registrations : [{ activityId: '', participantName: '' }];

  const updateEntry = (index: number, partial: Partial<ActivityRegistration>) => {
    const updated = entries.map((e, i) => (i === index ? { ...e, ...partial } : e));
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    onChange(updated.length > 0 ? updated : [{ activityId: '', participantName: '' }]);
  };

  const addEntry = () => {
    onChange([...entries, { activityId: '', participantName: '' }]);
  };

  // Running total for per_activity mode
  const runningTotal = activityPricingMode === 'per_activity'
    ? entries.reduce((sum, reg) => {
        const activity = activities.find((a) => a.id === reg.activityId);
        return sum + (activity?.price || 0);
      }, 0)
    : 0;

  return (
    <div className="space-y-3">
      <label className="label">Activities</label>
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <select
                value={entry.activityId}
                onChange={(e) => updateEntry(index, { activityId: e.target.value })}
                className="select text-sm"
              >
                <option value="">Select activity...</option>
                {activities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.name}
                    {activityPricingMode === 'per_activity' && act.price ? ` ($${act.price})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={entry.participantName}
                onChange={(e) => updateEntry(index, { participantName: e.target.value })}
                className="input text-sm"
                placeholder="Participant name"
              />
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className="p-2 text-gray-400 hover:text-red-600 flex-shrink-0"
              >
                <HiOutlineXMark className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addEntry}
        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
      >
        + Register for another activity
      </button>

      {activityPricingMode === 'per_activity' && runningTotal > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400 text-right">
          Activity total: <span className="font-semibold">${runningTotal}</span>
        </p>
      )}
    </div>
  );
}
