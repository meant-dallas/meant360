// Field validation utilities

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+-]+$/;
const NAME_RE = /^[a-zA-Z\s.'\-,]+$/;

export function validateEmail(value: string): string | null {
  if (!value) return null; // empty is OK (optional field)
  if (!EMAIL_RE.test(value)) return 'Invalid email address';
  return null;
}

export function validateEmailRequired(value: string): string | null {
  if (!value.trim()) return 'Email is required';
  if (!EMAIL_RE.test(value)) return 'Invalid email address';
  return null;
}

export function validatePhone(value: string): string | null {
  if (!value) return null;
  if (!PHONE_RE.test(value)) return 'Invalid phone number';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return 'Phone number must be at least 10 digits';
  if (digits.length > 15) return 'Phone number too long';
  return null;
}

export function validateName(value: string): string | null {
  if (!value) return null;
  if (!NAME_RE.test(value)) return 'Name contains invalid characters';
  return null;
}

export function validateNameRequired(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  if (!NAME_RE.test(value)) return 'Name contains invalid characters';
  return null;
}

export function validateAmount(value: string): string | null {
  if (!value) return 'Amount is required';
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return 'Enter a valid amount';
  return null;
}

export function validateUrl(value: string): string | null {
  if (!value) return null;
  try {
    new URL(value);
    return null;
  } catch {
    return 'Invalid URL';
  }
}
