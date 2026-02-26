// ========================================
// Security Utilities
// ========================================

/**
 * Sanitize a value before writing to Google Sheets to prevent formula injection.
 * Prefixes dangerous characters (=, +, -, @) with an apostrophe.
 */
export function sanitizeForSheets(value: string): string {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Apply sanitization to all string fields in a record before sheet write.
 */
export function sanitizeRecord(data: Record<string, string | number>): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = typeof value === 'string' ? sanitizeForSheets(value) : value;
  }
  return sanitized;
}

/**
 * Strip control characters from user input (except newlines and tabs).
 */
export function sanitizeInput(value: string): string {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Mask an email for public responses: j***e@gmail.com
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0];
  if (local.length <= 2) return `${local[0]}***@${parts[1]}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 3))}${local[local.length - 1]}@${parts[1]}`;
}

/**
 * Mask a phone number for public responses: ***-***-4567
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const lastFour = digits.slice(-4);
  return `***-***-${lastFour}`;
}
