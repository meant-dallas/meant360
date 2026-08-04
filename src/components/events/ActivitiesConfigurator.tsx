'use client';

import { useState } from 'react';
import type { ActivityConfig, ActivityPricingMode, ActivityMode } from '@/types';
import { getActivityLabels } from '@/lib/event-config';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineArrowUp, HiOutlineArrowDown } from 'react-icons/hi2';

interface ActivitiesConfiguratorProps {
  activities: ActivityConfig[];
  activityPricingMode: ActivityPricingMode;
  maxSlots?: number;
  mode: ActivityMode;
  onChange: (activities: ActivityConfig[]) => void;
  onMaxSlotsChange: (v: number | undefined) => void;
}

const emptyActivity: Omit<ActivityConfig, 'id'> = {
  name: '',
  description: '',
  maxParticipants: undefined,
  price: undefined,
  additionalParticipantPrice: undefined,
};

export default function ActivitiesConfigurator({ activities, activityPricingMode, maxSlots, mode, onChange, onMaxSlotsChange }: ActivitiesConfiguratorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyActivity);
  const [adding, setAdding] = useState(false);
  const labels = getActivityLabels(mode);
  const isTicketed = mode === 'ticketed_event';
  const showPriceFields = isTicketed || activityPricingMode === 'per_activity';

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    const newActivity: ActivityConfig = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
    };
    onChange([...activities, newActivity]);
    setDraft(emptyActivity);
    setAdding(false);
  };

  const handleUpdate = (id: string) => {
    if (!draft.name.trim()) return;
    onChange(activities.map((a) => (a.id === id ? { ...a, ...draft } : a)));
    setEditing(null);
    setDraft(emptyActivity);
  };

  const handleRemove = (id: string) => {
    onChange(activities.filter((a) => a.id !== id));
    if (editing === id) { setEditing(null); setDraft(emptyActivity); }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= activities.length) return;
    const updated = [...activities];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  const startEdit = (activity: ActivityConfig) => {
    setEditing(activity.id);
    setDraft({ name: activity.name, description: activity.description, maxParticipants: activity.maxParticipants, price: activity.price, additionalParticipantPrice: activity.additionalParticipantPrice });
    setAdding(false);
  };

  const draftFormJsx = (onSave: () => void, onCancel: () => void) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <div>
        <label className="label">Name *</label>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" placeholder={`${labels.itemNoun} name`} />
      </div>
      <div>
        <label className="label">Description</label>
        <input type="text" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input" placeholder="Optional description" />
      </div>
      {!isTicketed && (
        <div>
          <label className="label">Max Performers per Slot</label>
          <input type="number" min={0} value={draft.maxParticipants ?? ''} onChange={(e) => setDraft({ ...draft, maxParticipants: e.target.value ? parseInt(e.target.value) : undefined })} className="input" placeholder="Unlimited" />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Co-performers sharing one chest number</p>
        </div>
      )}
      {showPriceFields && (
        isTicketed ? (
          <div>
            <label className="label">Price ($)</label>
            <input type="number" min={0} step="0.01" value={draft.price ?? ''} onChange={(e) => setDraft({ ...draft, price: e.target.value ? parseFloat(e.target.value) : undefined })} className="input" placeholder="0" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">1st Participant Price ($)</label>
              <input type="number" min={0} step="0.01" value={draft.price ?? ''} onChange={(e) => setDraft({ ...draft, price: e.target.value ? parseFloat(e.target.value) : undefined })} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Additional Participant ($)</label>
              <input type="number" min={0} step="0.01" value={draft.additionalParticipantPrice ?? ''} onChange={(e) => setDraft({ ...draft, additionalParticipantPrice: e.target.value ? parseFloat(e.target.value) : undefined })} className="input" placeholder="Same as 1st" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">2nd, 3rd participant, etc.</p>
            </div>
          </div>
        )
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!draft.name.trim()} className="btn-primary text-sm px-3 py-1.5">Save</button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Event-level slot cap — Performance mode only. Ticketed events use
          Event Capacity (per-adult/per-kid) above as the single cap instead,
          so this doesn't end up as a second, contradictory limit. */}
      {!isTicketed && (
        <div>
          <label className="label">{labels.maxSlotsLabel}</label>
          <input
            type="number"
            min={0}
            value={maxSlots ?? ''}
            onChange={(e) => onMaxSlotsChange(e.target.value ? parseInt(e.target.value) : undefined)}
            className="input"
            placeholder="Unlimited"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {labels.maxSlotsHelp}
          </p>
        </div>
      )}

      {activities.length > 0 && (
        <div className="space-y-2">
          {activities.map((activity, i) => (
            <div key={activity.id}>
              {editing === activity.id ? (
                draftFormJsx(() => handleUpdate(activity.id), () => { setEditing(null); setDraft(emptyActivity); })
              ) : (
                <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{activity.name}</p>
                    {activity.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{activity.description}</p>}
                  </div>
                  {showPriceFields && activity.price != null && activity.price > 0 && (
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      ${activity.price}
                      {!isTicketed && activity.additionalParticipantPrice != null && activity.additionalParticipantPrice !== activity.price && (
                        <span className="text-gray-400 dark:text-gray-500"> / +${activity.additionalParticipantPrice}</span>
                      )}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleMove(i, 1)} disabled={i === activities.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => startEdit(activity)} className="p-1 text-gray-400 hover:text-primary-600">
                      <HiOutlinePencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleRemove(activity.id)} className="p-1 text-gray-400 hover:text-red-600">
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        draftFormJsx(handleAdd, () => { setAdding(false); setDraft(emptyActivity); })
      ) : (
        <button type="button" onClick={() => { setAdding(true); setEditing(null); setDraft(emptyActivity); }} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
          <HiOutlinePlus className="w-4 h-4" /> {labels.addButtonLabel}
        </button>
      )}
    </div>
  );
}
