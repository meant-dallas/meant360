import { clsx, type ClassValue } from 'clsx';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    return format(parseISO(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
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
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parts[2] ? parseInt(parts[2], 10) : 1;
    const dob = new Date(year, month, day);
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
