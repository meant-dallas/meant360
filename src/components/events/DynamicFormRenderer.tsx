'use client';

import { useState } from 'react';
import type { FormFieldConfig } from '@/types';
import { validateEmail, validatePhone, validateNumber } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import { HiOutlineInformationCircle } from 'react-icons/hi2';

interface DynamicFormRendererProps {
  fields: FormFieldConfig[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  errors: Record<string, string | null>;
  onValidate: (errors: Record<string, string | null>) => void;
  // Populates 'name'-type fields with a dropdown of these instead of a free
  // text box. Omitted/empty falls back to plain text (e.g. for guests).
  familyMembers?: { name: string; age: string }[];
}

const OTHER_NAME_SENTINEL = '__other__';

const RequiredMark = () => <span className="text-red-600 dark:text-red-400"> *</span>;

export default function DynamicFormRenderer({ fields, values, onChange, errors, onValidate, familyMembers }: DynamicFormRendererProps) {
  // Once a name field's value doesn't match any family member (typed
  // manually, or "Someone else" was picked), keep showing the text box
  // instead of snapping back to the dropdown on every keystroke.
  const [customNameFields, setCustomNameFields] = useState<Record<string, boolean>>({});

  if (fields.length === 0) return null;

  const handleChange = (id: string, value: string) => {
    onChange({ ...values, [id]: value });
    onValidate({ ...errors, [id]: null });
  };

  const handleBlur = (field: FormFieldConfig) => {
    const value = values[field.id] || '';
    let error: string | null = null;

    if (field.required && !value.trim()) {
      error = `${field.label} is required`;
    } else if (value.trim()) {
      if (field.type === 'email') error = validateEmail(value);
      if (field.type === 'phone') error = validatePhone(value);
      if (field.type === 'number') error = validateNumber(value);
    }

    onValidate({ ...errors, [field.id]: error });
  };

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = values[field.id] || '';
        const hasError = !!errors[field.id];
        const errorClass = hasError ? 'border-red-500 dark:border-red-500' : '';

        switch (field.type) {
          // A static message, not an input — field.label holds the message
          // text itself (see FormFieldConfigurator, where "Label" fields get
          // a "Message" input instead of a field label, and hide
          // Placeholder/Required/Options entirely since there's no value to
          // collect). No value binding, no validation, no FieldError.
          case 'label':
            return (
              <p key={field.id} className="flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <HiOutlineInformationCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                <span>{field.label}</span>
              </p>
            );

          case 'checkbox':
            return (
              <div key={field.id}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value === 'true'}
                    onChange={(e) => handleChange(field.id, e.target.checked ? 'true' : 'false')}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {field.label}{field.required && <RequiredMark />}
                  </span>
                </label>
                <FieldError error={errors[field.id]} />
              </div>
            );

          case 'name': {
            const hasFamilyOptions = !!familyMembers && familyMembers.length > 0;
            const showCustomInput = !hasFamilyOptions || customNameFields[field.id] || (!!value && !familyMembers!.some((fm) => fm.name === value));
            if (showCustomInput) {
              return (
                <div key={field.id}>
                  <label className="label">{field.label}{field.required && <RequiredMark />}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => handleChange(field.id, e.target.value)}
                      onBlur={() => handleBlur(field)}
                      className={`input ${errorClass}`}
                      placeholder={field.placeholder}
                    />
                    {hasFamilyOptions && (
                      <button
                        type="button"
                        onClick={() => { setCustomNameFields((c) => ({ ...c, [field.id]: false })); handleChange(field.id, ''); }}
                        className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap"
                      >
                        Choose from family
                      </button>
                    )}
                  </div>
                  <FieldError error={errors[field.id]} />
                </div>
              );
            }
            return (
              <div key={field.id}>
                <label className="label">{field.label}{field.required && <RequiredMark />}</label>
                <select
                  value={value}
                  onChange={(e) => {
                    if (e.target.value === OTHER_NAME_SENTINEL) {
                      setCustomNameFields((c) => ({ ...c, [field.id]: true }));
                      handleChange(field.id, '');
                    } else {
                      handleChange(field.id, e.target.value);
                    }
                  }}
                  onBlur={() => handleBlur(field)}
                  className={`select ${errorClass}`}
                >
                  <option value="">{field.placeholder || 'Select a family member...'}</option>
                  {familyMembers!.map((fm) => (
                    <option key={fm.name} value={fm.name}>{fm.name}{fm.age ? ` (${fm.age})` : ''}</option>
                  ))}
                  <option value={OTHER_NAME_SENTINEL}>Someone else…</option>
                </select>
                <FieldError error={errors[field.id]} />
              </div>
            );
          }

          case 'select':
            return (
              <div key={field.id}>
                <label className="label">{field.label}{field.required && <RequiredMark />}</label>
                <select
                  value={value}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  onBlur={() => handleBlur(field)}
                  className={`select ${errorClass}`}
                >
                  <option value="">{field.placeholder || 'Select...'}</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <FieldError error={errors[field.id]} />
              </div>
            );

          case 'textarea':
            return (
              <div key={field.id}>
                <label className="label">{field.label}{field.required && <RequiredMark />}</label>
                <textarea
                  value={value}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  onBlur={() => handleBlur(field)}
                  className={`input ${errorClass}`}
                  rows={3}
                  placeholder={field.placeholder}
                />
                <FieldError error={errors[field.id]} />
              </div>
            );

          default: {
            const inputType = field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text';
            return (
              <div key={field.id}>
                <label className="label">{field.label}{field.required && <RequiredMark />}</label>
                <input
                  type={inputType}
                  value={value}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  onBlur={() => handleBlur(field)}
                  className={`input ${errorClass}`}
                  placeholder={field.placeholder}
                />
                <FieldError error={errors[field.id]} />
              </div>
            );
          }
        }
      })}
    </div>
  );
}

/**
 * Validate all dynamic form fields. Returns errors record.
 */
export function validateDynamicFields(
  fields: FormFieldConfig[],
  values: Record<string, string>,
): Record<string, string | null> {
  const errors: Record<string, string | null> = {};
  for (const field of fields) {
    // A 'label' field is a static message, not an input — it never
    // collects a value, so it can never be "required" even if `required`
    // got stuck true from before its type was switched to 'label' (the
    // admin UI hides that toggle for label fields, but doesn't reset it).
    if (field.type === 'label') { errors[field.id] = null; continue; }
    const value = values[field.id] || '';
    if (field.required && !value.trim()) {
      errors[field.id] = `${field.label} is required`;
    } else if (value.trim()) {
      if (field.type === 'email') errors[field.id] = validateEmail(value);
      else if (field.type === 'phone') errors[field.id] = validatePhone(value);
      else if (field.type === 'number') errors[field.id] = validateNumber(value);
      else errors[field.id] = null;
    } else {
      errors[field.id] = null;
    }
  }
  return errors;
}
