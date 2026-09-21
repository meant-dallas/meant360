'use client';

import { useState } from 'react';
import type { EntryTypeConfig, FormFieldConfig } from '@/types';
import FormFieldConfigurator from './FormFieldConfigurator';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineArrowUp, HiOutlineArrowDown, HiOutlineDocumentDuplicate } from 'react-icons/hi2';

interface EntryTypesConfiguratorProps {
  entryTypes: EntryTypeConfig[];
  onChange: (entryTypes: EntryTypeConfig[]) => void;
  // The item's own Name field — pre-fills the first entry type's label so an
  // admin who only needs one variant (e.g. "Group Dance Team" with just a
  // "Team" entry, added multiple times) isn't forced to retype the same
  // name twice. Still freely editable, and only applied to the very first
  // entry type — once a second one exists there's a real distinction to name.
  defaultLabel?: string;
}

type Draft = Omit<EntryTypeConfig, 'key'>;

// Every entry type needs at least one participant field — the FIRST one
// doubles as that participant's name for the dashboard, CSV export, and
// sibling/multi-event discount matching, so a new entry type is always
// seeded with an editable "Name" field rather than a hardcoded, unlabeled
// name box the admin can't see or change.
const defaultParticipantFields = (): FormFieldConfig[] => [
  { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: 'Name', type: 'text', required: true },
];

const createEmptyEntryType = (): Draft => ({
  label: '',
  pricingMode: 'flat',
  memberPrice: 0,
  guestPrice: 0,
  minParticipants: 1,
  maxParticipants: undefined,
  capacity: undefined,
  participantFields: defaultParticipantFields(),
});

// Same add/edit/remove list-editing pattern as ItemsConfigurator and
// FormFieldConfigurator — an Activity item's entry types are edited inline
// here, one per variant a registrant can add as an entry (e.g. Solo/Group).
export default function EntryTypesConfigurator({ entryTypes, onChange, defaultLabel }: EntryTypesConfiguratorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(createEmptyEntryType());
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!draft.label.trim()) return;
    const newEntryType: EntryTypeConfig = {
      key: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
    };
    onChange([...entryTypes, newEntryType]);
    setDraft(createEmptyEntryType());
    setAdding(false);
  };

  const handleUpdate = (key: string) => {
    if (!draft.label.trim()) return;
    onChange(entryTypes.map((et) => (et.key === key ? { ...et, ...draft } : et)));
    setEditing(null);
    setDraft(createEmptyEntryType());
  };

  const handleRemove = (key: string) => {
    const entryType = entryTypes.find((et) => et.key === key);
    if (!confirm(`Delete "${entryType?.label || 'this entry type'}"? This cannot be undone.`)) return;
    onChange(entryTypes.filter((et) => et.key !== key));
    if (editing === key) { setEditing(null); setDraft(createEmptyEntryType()); }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= entryTypes.length) return;
    const updated = [...entryTypes];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  const handleDuplicate = (index: number) => {
    const source = entryTypes[index];
    const copy: EntryTypeConfig = {
      ...source,
      key: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: `${source.label} (Copy)`,
      participantFields: (source.participantFields || []).map((f) => ({ ...f })),
    };
    const updated = [...entryTypes];
    updated.splice(index + 1, 0, copy);
    onChange(updated);
  };

  const startEdit = (entryType: EntryTypeConfig) => {
    setEditing(entryType.key);
    setDraft({
      label: entryType.label,
      pricingMode: entryType.pricingMode,
      memberPrice: entryType.memberPrice,
      guestPrice: entryType.guestPrice,
      minParticipants: entryType.minParticipants,
      maxParticipants: entryType.maxParticipants,
      capacity: entryType.capacity,
      participantFields: entryType.participantFields && entryType.participantFields.length > 0 ? entryType.participantFields : defaultParticipantFields(),
    });
    setAdding(false);
  };

  const draftFormJsx = (onSave: () => void, onCancel: () => void) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Label *</label>
          <input type="text" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="input" placeholder="e.g. Solo, Group, Deluxe Room" />
        </div>
        <div>
          <label className="label">Pricing</label>
          <select value={draft.pricingMode} onChange={(e) => setDraft({ ...draft, pricingMode: e.target.value as EntryTypeConfig['pricingMode'] })} className="select">
            <option value="flat">Flat (per entry)</option>
            <option value="per_participant">Per participant</option>
          </select>
        </div>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Min Participants</label>
          <input type="number" min={1} value={draft.minParticipants ?? 1} onChange={(e) => setDraft({ ...draft, minParticipants: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="input" />
        </div>
        <div>
          <label className="label">Max Participants</label>
          <input type="number" min={1} value={draft.maxParticipants ?? ''} onChange={(e) => setDraft({ ...draft, maxParticipants: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="input" placeholder="Unlimited" />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
        Capacity limits how many {draft.label ? `"${draft.label}"` : 'of these'} entries can be added across the whole event (e.g. only 1 Deluxe Room) — leave blank for unlimited. Min/Max Participants bounds how many names can be on a single entry (e.g. a Group performance needs 2+ performers).
      </p>
      <div>
        <label className="label">Participant Fields *</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Questions asked about EACH participant on a {draft.label || 'this'} entry — nothing is hardcoded, so add and label every field yourself, including a name question. The <strong>first field</strong> is used as that participant&apos;s name on the dashboard, in exports, and for sibling/multi-event discount matching — reorder if you want a different one to lead. Separate from the item&apos;s Custom Fields above, which are asked once per entry regardless of headcount.
        </p>
        <FormFieldConfigurator
          fields={draft.participantFields || []}
          onChange={(participantFields: FormFieldConfig[]) => setDraft({ ...draft, participantFields })}
        />
        {(draft.participantFields || []).length === 0 && (
          <p className="text-xs text-red-600 mt-1">Add at least one field (e.g. Name) — every entry needs a way to identify who&apos;s on it.</p>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!draft.label.trim() || (draft.participantFields || []).length === 0} className="btn-primary text-sm px-3 py-1.5">Save</button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {entryTypes.length > 0 && (
        <div className="space-y-2">
          {entryTypes.map((entryType, i) => (
            <div key={entryType.key}>
              {editing === entryType.key ? (
                draftFormJsx(() => handleUpdate(entryType.key), () => { setEditing(null); setDraft(createEmptyEntryType()); })
              ) : (
                <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{entryType.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {entryType.minParticipants ?? 1}
                      {entryType.maxParticipants ? `–${entryType.maxParticipants}` : '+'} participant{(entryType.maxParticipants ?? 2) !== 1 ? 's' : ''}
                      {entryType.participantFields && entryType.participantFields.length > 0 && (
                        <> · {entryType.participantFields.length} question{entryType.participantFields.length !== 1 ? 's' : ''} per participant</>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                    ${entryType.memberPrice}{entryType.guestPrice !== entryType.memberPrice ? ` / $${entryType.guestPrice} guest` : ''}
                    <span className="text-gray-400 dark:text-gray-500"> · {entryType.pricingMode === 'flat' ? 'flat' : 'per participant'}</span>
                    {entryType.capacity ? <span className="text-gray-400 dark:text-gray-500"> · cap {entryType.capacity}</span> : null}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleMove(i, 1)} disabled={i === entryTypes.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => startEdit(entryType)} className="p-1 text-gray-400 hover:text-primary-600">
                      <HiOutlinePencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDuplicate(i)} title="Duplicate" className="p-1 text-gray-400 hover:text-primary-600">
                      <HiOutlineDocumentDuplicate className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleRemove(entryType.key)} className="p-1 text-gray-400 hover:text-red-600">
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
        draftFormJsx(handleAdd, () => { setAdding(false); setDraft(createEmptyEntryType()); })
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditing(null);
            // Pre-fill the first entry type's label from the item's own Name
            // so a single-variant Activity (e.g. "Group Dance Team" added
            // multiple times as separate teams) doesn't require retyping the
            // same name twice. Only applies to the first — once a second
            // entry type is being added there's a real distinction to name.
            setDraft(entryTypes.length === 0 && defaultLabel ? { ...createEmptyEntryType(), label: defaultLabel } : createEmptyEntryType());
          }}
          className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
        >
          <HiOutlinePlus className="w-4 h-4" /> Add Entry Type
        </button>
      )}
    </div>
  );
}
