import { clsx, type ClassValue } from 'clsx';
import { startOfYear, endOfYear } from 'date-fns';

// All event/registration times are stored as UTC ISO strings in the DB.
// Always display in CST (America/Chicago handles both CST and CDT automatically).
const APP_TZ = 'America/Chicago';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// Parse a date string into a Date safely.
// Bare YYYY-MM-DD strings are anchored at noon UTC to avoid off-by-one errors
// when displaying in US timezones (CDT = UTC-5, CST = UTC-6).
// Full ISO timestamps (containing 'T') are passed through unchanged.
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T12:00:00Z' : dateStr;
  return new Date(iso);
}

// Format a date string or UTC ISO timestamp for display in CST.
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const d = parseLocalDate(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: APP_TZ,
    });
  } catch {
    return dateString;
  }
}

// Returns the current date in CST as YYYY-MM-DD (for "today" comparisons against stored event dates).
export function todayCST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TZ });
}

// Compute calendar days until a YYYY-MM-DD deadline, relative to today in CST.
// Both sides are anchored at noon UTC so the math is timezone-consistent on
// Vercel's UTC servers (avoids the UTC-midnight vs CST-midnight drift).
// Returns null if dateStr is empty or unparseable. Negative = overdue.
export function daysUntilCST(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = parseLocalDate(todayCST());
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Format a UTC ISO timestamp as time only in CST, e.g. "02:30 PM".
export function formatTimeCSTShort(isoString: string): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: APP_TZ,
    });
  } catch {
    return isoString;
  }
}

// Format a UTC ISO timestamp as full date + time in CST, e.g. "Mar 30, 2026, 02:30 PM".
export function formatDateTimeCST(isoString: string): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: APP_TZ,
    });
  } catch {
    return isoString;
  }
}

export function getCurrentFinancialYear(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfYear(now),
    end: endOfYear(now),
  };
}

export function getFinancialYearRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function stripPhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function calculateAge(dateOfBirth: string): string {
  if (!dateOfBirth) return '';
  try {
    // Support both YYYY-MM (month picker) and YYYY-MM-DD formats
    const parts = dateOfBirth.split('-');
    if (parts.length < 2) return '';
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parts[2] ? parseInt(parts[2], 10) : 1;
    if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
    const dob = new Date(year, month, day);
    if (isNaN(dob.getTime())) return '';
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      years--;
    }
    if (years < 0) return '';
    return String(years);
  } catch {
    return '';
  }
}

export function parseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );
}

export function sumBy<T>(array: T[], key: keyof T): number {
  return array.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
}
