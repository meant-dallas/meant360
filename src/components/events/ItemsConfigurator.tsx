'use client';

import { useState } from 'react';
import type { ItemConfig, ItemPricingMode, FormFieldConfig, EntryTypeConfig } from '@/types';
import FormFieldConfigurator from './FormFieldConfigurator';
import EntryTypesConfigurator from './EntryTypesConfigurator';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineArrowUp, HiOutlineArrowDown } from 'react-icons/hi2';

interface ItemsConfiguratorProps {
  items: ItemConfig[];
  onChange: (items: ItemConfig[]) => void;
}

const PRICING_MODE_LABELS: Record<ItemPricingMode, string> = {
  flat: 'Flat (once per registration)',
  per_participant: 'Per participant',
  per_unit: 'Per unit (quantity)',
};

type Behavior = 'standard' | 'general_attendance' | 'activity';

function behaviorOf(item: Pick<ItemConfig, 'isGeneralAttendance' | 'isActivity'>): Behavior {
  if (item.isGeneralAttendance) return 'general_attendance';
  if (item.isActivity) return 'activity';
  return 'standard';
}

const BEHAVIOR_LABELS: Record<Behavior, string> = {
  standard: 'Standard',
  general_attendance: 'General Attendance',
  activity: 'Activity',
};

const BEHAVIOR_HINTS: Record<Behavior, string> = {
  standard: 'A regular catalog item — a room, an add-on, a ticket tier. Selected once, priced by quantity or participant count.',
  general_attendance: 'Plain event attendance rather than a distinct activity — required, excluded from the multi-event discount count. Its headcount isn\'t frozen at registration either: front desk can add a walk-in at check-in and the count (and price, if per-participant) updates the same way.',
  activity: 'Registrants add this item multiple times as separate entries — e.g. two Music Performance entries, one Solo one Group — each with its own entry type, participant names, and price. Define the entry types below; this item\'s own price/capacity fields are unused.',
};

type Draft = Omit<ItemConfig, 'id'>;

const emptyItem: Draft = {
  name: '',
  description: '',
  pricingMode: 'flat',
  memberPrice: 0,
  guestPrice: 0,
  capacity: undefined,
  required: false,
  enabled: true,
  customFields: [],
  isGeneralAttendance: false,
  isActivity: false,
  entryTypes: [],
  visibleToMembers: true,
  visibleToGuests: true,
};

export default function ItemsConfigurator({ items, onChange }: ItemsConfiguratorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyItem);
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    const newItem: ItemConfig = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
    };
    onChange([...items, newItem]);
    setDraft(emptyItem);
    setAdding(false);
  };

  const handleUpdate = (id: string) => {
    if (!draft.name.trim()) return;
    onChange(items.map((it) => (it.id === id ? { ...it, ...draft } : it)));
    setEditing(null);
    setDraft(emptyItem);
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
    if (editing === id) { setEditing(null); setDraft(emptyItem); }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const updated = [...items];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  const startEdit = (item: ItemConfig) => {
    setEditing(item.id);
    setDraft({
      name: item.name,
      description: item.description,
      pricingMode: item.pricingMode,
      memberPrice: item.memberPrice,
      guestPrice: item.guestPrice,
      capacity: item.capacity,
      required: item.required,
      enabled: item.enabled,
      customFields: item.customFields,
      isGeneralAttendance: item.isGeneralAttendance,
      isActivity: item.isActivity,
      entryTypes: item.entryTypes || [],
      visibleToMembers: item.visibleToMembers ?? true,
      visibleToGuests: item.visibleToGuests ?? true,
    });
    setAdding(false);
  };

  const setBehavior = (behavior: Behavior) => {
    setDraft((d) => ({
      ...d,
      isGeneralAttendance: behavior === 'general_attendance',
      isActivity: behavior === 'activity',
      required: behavior === 'general_attendance' ? true : behavior === 'activity' ? false : d.required,
    }));
  };

  const draftFormJsx = (onSave: () => void, onCancel: () => void) => {
    const behavior = behaviorOf(draft);
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
        <div>
          <label className="label">Name *</label>
          <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" placeholder="e.g. Room 1, Kayaking, Music Performance" />
        </div>
        <div>
          <label className="label">Description</label>
          <input type="text" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input" placeholder="Optional description" />
        </div>

        <div>
          <label className="label">Item Behavior</label>
          <div className="flex items-center gap-4">
            {(Object.keys(BEHAVIOR_LABELS) as Behavior[]).map((b) => (
              <label key={b} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="item-behavior"
                  checked={behavior === b}
                  onChange={() => setBehavior(b)}
                  className="border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{BEHAVIOR_LABELS[b]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{BEHAVIOR_HINTS[behavior]}</p>
        </div>

        {behavior === 'activity' ? (
          <div>
            <label className="label">Entry Types</label>
            <EntryTypesConfigurator
              entryTypes={draft.entryTypes || []}
              onChange={(entryTypes: EntryTypeConfig[]) => setDraft({ ...draft, entryTypes })}
              defaultLabel={draft.name}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pricing</label>
                <select value={draft.pricingMode} onChange={(e) => setDraft({ ...draft, pricingMode: e.target.value as ItemPricingMode })} className="select">
                  {(Object.keys(PRICING_MODE_LABELS) as ItemPricingMode[]).map((m) => (
                    <option key={m} value={m}>{PRICING_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Capacity</label>
                <input type="number" min={0} value={draft.capacity ?? ''} onChange={(e) => setDraft({ ...draft, capacity: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="input" placeholder="Unlimited" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Member Price ($)</label>
                <input type="number" min={0} step="0.01" value={draft.memberPrice} onChange={(e) => setDraft({ ...draft, memberPrice: parseFloat(e.target.value) || 0 })} className="input" />
              </div>
              <div>
                <label className="label">Guest Price ($)</label>
                <input type="number" min={0} step="0.01" value={draft.guestPrice} onChange={(e) => setDraft({ ...draft, guestPrice: parseFloat(e.target.value) || 0 })} className="input" />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.required}
              disabled={behavior === 'general_attendance' || behavior === 'activity'}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Required (auto-included)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
          </label>
        </div>

        <div>
          <label className="label">Visible To</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Which registrant identity can see and select this item — e.g. a members-only Dinner Gala vs. a Math Olympiad open to both.</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.visibleToMembers ?? true} onChange={(e) => setDraft({ ...draft, visibleToMembers: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Members</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.visibleToGuests ?? true} onChange={(e) => setDraft({ ...draft, visibleToGuests: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Guests</span>
            </label>
          </div>
        </div>

        <div>
          <label className="label">Custom Fields</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {behavior === 'activity'
              ? 'Extra information to collect on every entry of this activity (e.g. song title, dietary needs).'
              : 'Extra information to collect when this item is selected (e.g. arrival time, participant names, dietary needs).'}
          </p>
          <FormFieldConfigurator fields={draft.customFields} onChange={(fields: FormFieldConfig[]) => setDraft({ ...draft, customFields: fields })} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onSave} disabled={!draft.name.trim()} className="btn-primary text-sm px-3 py-1.5">Save</button>
          <button type="button" onClick={onCancel} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => {
            const behavior = behaviorOf(item);
            return (
              <div key={item.id}>
                {editing === item.id ? (
                  draftFormJsx(() => handleUpdate(item.id), () => { setEditing(null); setDraft(emptyItem); })
                ) : (
                  <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                        {item.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">Required</span>}
                        {behavior !== 'standard' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{BEHAVIOR_LABELS[behavior]}</span>
                        )}
                        {!item.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Disabled</span>}
                        {item.visibleToMembers === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Guests only</span>}
                        {item.visibleToGuests === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Members only</span>}
                        {behavior === 'activity' && (item.entryTypes || []).map((et) => (
                          <span key={et.key} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {et.label} · ${et.memberPrice}
                          </span>
                        ))}
                      </div>
                      {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>}
                    </div>
                    {behavior !== 'activity' && (
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                        ${item.memberPrice}{item.guestPrice !== item.memberPrice ? ` / $${item.guestPrice} guest` : ''}
                        <span className="text-gray-400 dark:text-gray-500"> · {PRICING_MODE_LABELS[item.pricingMode]}</span>
                        {item.capacity ? <span className="text-gray-400 dark:text-gray-500"> · cap {item.capacity}</span> : null}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <HiOutlineArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => handleMove(i, 1)} disabled={i === items.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <HiOutlineArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-primary-600">
                        <HiOutlinePencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => handleRemove(item.id)} className="p-1 text-gray-400 hover:text-red-600">
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        draftFormJsx(handleAdd, () => { setAdding(false); setDraft(emptyItem); })
      ) : (
        <button type="button" onClick={() => { setAdding(true); setEditing(null); setDraft(emptyItem); }} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
          <HiOutlinePlus className="w-4 h-4" /> Add Item
        </button>
      )}
    </div>
  );
}
