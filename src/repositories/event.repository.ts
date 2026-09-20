import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const JSON_FIELDS = ['pricingRules', 'formConfig', 'activities', 'guestPolicy', 'items'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  for (const field of JSON_FIELDS) {
    if (r[field] && typeof r[field] === 'object') {
      r[field] = JSON.stringify(r[field]);
    }
  }
  return toStringRecord(r);
}

const INT_FIELDS = ['capacity'];
// The only real DateTime column on Event — everything else uses the legacy
// string convention (createdAt/updatedAt are String, not DateTime). The
// generic crud.service.ts update() round-trips a `toStringRecord()`'d
// `existing` record (which turns `deletedAt: null` into `''`) back through
// here, so an untouched '' must become `null`, not the literal string.
const DATE_FIELDS = ['deletedAt'];

function fromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (JSON_FIELDS.includes(key) && typeof value === 'string' && value) {
      try { result[key] = JSON.parse(value); } catch { result[key] = value; }
    } else if (INT_FIELDS.includes(key)) {
      result[key] = typeof value === 'string' ? parseInt(value, 10) || 0 : Number(value) || 0;
    } else if (DATE_FIELDS.includes(key)) {
      result[key] = value instanceof Date ? value : value ? new Date(String(value)) : null;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const eventRepository = {
  // Soft-deleted events (deletedAt set) are excluded here so they disappear
  // from every list/dropdown that goes through findAll — findById still
  // resolves them, so historical records (registrations, ledger entries,
  // ...) referencing a deleted event keep rendering correctly.
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.event.findMany({ where: where as any });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.event.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.event.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // Remove non-updatable fields
    delete input.id;
    delete input.participants;
    delete input.attendances;
    delete input.income;
    delete input.expenses;
    delete input.sponsors;
    delete input.itemRegistrations;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.event.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  // Soft delete — hard-deleting routinely fails on FK constraints once an
  // event has any real activity (participants, ledger entries, fin
  // transactions, sponsors, ...), and losing that history isn't actually
  // what "delete this event" should mean from the admin's side anyway.
  async delete(id: string): Promise<void> {
    await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
