'use client';

import type { FormFieldConfig } from '@/types';
import { validateEmail, validatePhone } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';

interface DynamicFormRendererProps {
  fields: FormFieldConfig[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  errors: Record<string, string | null>;
  onValidate: (errors: Record<string, string | null>) => void;
}

export default function DynamicFormRenderer({ fields, values, onChange, errors, onValidate }: DynamicFormRendererProps) {
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
                    {field.label}{field.required ? ' *' : ''}
                  </span>
                </label>
                <FieldError error={errors[field.id]} />
              </div>
            );

          case 'select':
            return (
              <div key={field.id}>
                <label className="label">{field.label}{field.required ? ' *' : ''}</label>
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
                <label className="label">{field.label}{field.required ? ' *' : ''}</label>
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
                <label className="label">{field.label}{field.required ? ' *' : ''}</label>
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
    const value = values[field.id] || '';
    if (field.required && !value.trim()) {
      errors[field.id] = `${field.label} is required`;
    } else if (value.trim()) {
      if (field.type === 'email') errors[field.id] = validateEmail(value);
      else if (field.type === 'phone') errors[field.id] = validatePhone(value);
      else errors[field.id] = null;
    } else {
      errors[field.id] = null;
    }
  }
  return errors;
}
