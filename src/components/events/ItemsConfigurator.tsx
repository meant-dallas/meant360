'use client';

import { useState } from 'react';
import type { ItemConfig, ItemPricingMode, FormFieldConfig } from '@/types';
import FormFieldConfigurator from './FormFieldConfigurator';
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
    });
    setAdding(false);
  };

  const draftFormJsx = (onSave: () => void, onCancel: () => void) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Name *</label>
          <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" placeholder="e.g. Room 1, Kayaking, Math Olympiad" />
        </div>
        <div>
          <label className="label">Pricing</label>
          <select value={draft.pricingMode} onChange={(e) => setDraft({ ...draft, pricingMode: e.target.value as ItemPricingMode })} className="select">
            {(Object.keys(PRICING_MODE_LABELS) as ItemPricingMode[]).map((m) => (
              <option key={m} value={m}>{PRICING_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input type="text" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input" placeholder="Optional description" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Member Price ($)</label>
          <input type="number" min={0} step="0.01" value={draft.memberPrice} onChange={(e) => setDraft({ ...draft, memberPrice: parseFloat(e.target.value) || 0 })} className="input" />
        </div>
        <div>
          <label className="label">Guest Price ($)</label>
          <input type="number" min={0} step="0.01" value={draft.guestPrice} onChange={(e) => setDraft({ ...draft, guestPrice: parseFloat(e.target.value) || 0 })} className="input" />
        </div>
        <div>
          <label className="label">Capacity</label>
          <input type="number" min={0} value={draft.capacity ?? ''} onChange={(e) => setDraft({ ...draft, capacity: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="input" placeholder="Unlimited" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Required (auto-included)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.isGeneralAttendance ?? false}
            onChange={(e) => setDraft({ ...draft, isGeneralAttendance: e.target.checked, required: e.target.checked ? true : draft.required })}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">General Attendance</span>
        </label>
      </div>
      {draft.isGeneralAttendance && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">Plain event attendance rather than a distinct activity — excluded from the multi-event discount count.</p>
      )}
      <div>
        <label className="label">Custom Fields</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Extra information to collect when this item is selected (e.g. arrival time, participant names, dietary needs).</p>
        <FormFieldConfigurator fields={draft.customFields} onChange={(fields: FormFieldConfig[]) => setDraft({ ...draft, customFields: fields })} />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!draft.name.trim()} className="btn-primary text-sm px-3 py-1.5">Save</button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id}>
              {editing === item.id ? (
                draftFormJsx(() => handleUpdate(item.id), () => { setEditing(null); setDraft(emptyItem); })
              ) : (
                <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                      {item.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">Required</span>}
                      {item.isGeneralAttendance && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">General Attendance</span>}
                      {!item.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Disabled</span>}
                    </div>
                    {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>}
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                    ${item.memberPrice}{item.guestPrice !== item.memberPrice ? ` / $${item.guestPrice} guest` : ''}
                    <span className="text-gray-400 dark:text-gray-500"> · {PRICING_MODE_LABELS[item.pricingMode]}</span>
                    {item.capacity ? <span className="text-gray-400 dark:text-gray-500"> · cap {item.capacity}</span> : null}
                  </span>
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
          ))}
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
