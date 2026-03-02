'use client';

import { useState } from 'react';
import type { FormFieldConfig, FormFieldType } from '@/types';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineArrowUp, HiOutlineArrowDown } from 'react-icons/hi2';

interface FormFieldConfiguratorProps {
  fields: FormFieldConfig[];
  onChange: (fields: FormFieldConfig[]) => void;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Text Area' },
];

const emptyField: Omit<FormFieldConfig, 'id'> = {
  label: '',
  type: 'text',
  required: false,
  placeholder: '',
  options: [],
};

export default function FormFieldConfigurator({ fields, onChange }: FormFieldConfiguratorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyField);
  const [optionsStr, setOptionsStr] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!draft.label.trim()) return;
    const newField: FormFieldConfig = {
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
      options: draft.type === 'select' ? optionsStr.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
    };
    onChange([...fields, newField]);
    setDraft(emptyField);
    setOptionsStr('');
    setAdding(false);
  };

  const handleUpdate = (id: string) => {
    if (!draft.label.trim()) return;
    onChange(fields.map((f) => (f.id === id ? {
      ...f,
      ...draft,
      options: draft.type === 'select' ? optionsStr.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
    } : f)));
    setEditing(null);
    setDraft(emptyField);
    setOptionsStr('');
  };

  const handleRemove = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
    if (editing === id) { setEditing(null); setDraft(emptyField); setOptionsStr(''); }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  const startEdit = (field: FormFieldConfig) => {
    setEditing(field.id);
    setDraft({ label: field.label, type: field.type, required: field.required, placeholder: field.placeholder });
    setOptionsStr(field.options?.join(', ') || '');
    setAdding(false);
  };

  const draftFormJsx = (onSave: () => void, onCancel: () => void) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Label *</label>
          <input type="text" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="input" placeholder="Field label" />
        </div>
        <div>
          <label className="label">Type</label>
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FormFieldType })} className="select">
            {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Placeholder</label>
          <input type="text" value={draft.placeholder || ''} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} className="input" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
          </label>
        </div>
      </div>
      {draft.type === 'select' && (
        <div>
          <label className="label">Options (comma-separated)</label>
          <input type="text" value={optionsStr} onChange={(e) => setOptionsStr(e.target.value)} className="input" placeholder="Option 1, Option 2, Option 3" />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!draft.label.trim()} className="btn-primary text-sm px-3 py-1.5">Save</button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.id}>
              {editing === field.id ? (
                draftFormJsx(() => handleUpdate(field.id), () => { setEditing(null); setDraft(emptyField); setOptionsStr(''); })
              ) : (
                <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{field.label}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase">
                        {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                      </span>
                      {field.required && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Required</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleMove(i, 1)} disabled={i === fields.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <HiOutlineArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => startEdit(field)} className="p-1 text-gray-400 hover:text-primary-600">
                      <HiOutlinePencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleRemove(field.id)} className="p-1 text-gray-400 hover:text-red-600">
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
        draftFormJsx(handleAdd, () => { setAdding(false); setDraft(emptyField); setOptionsStr(''); })
      ) : (
        <button type="button" onClick={() => { setAdding(true); setEditing(null); setDraft(emptyField); setOptionsStr(''); }} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
          <HiOutlinePlus className="w-4 h-4" /> Add Field
        </button>
      )}
    </div>
  );
}
