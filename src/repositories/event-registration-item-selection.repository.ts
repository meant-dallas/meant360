import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const JSON_FIELDS = ['customFieldResponses'];

const UPDATABLE_FIELDS = new Set([
  'quantity', 'priceCharged', 'customFieldResponses',
  'status', 'cancelledAt', 'refundedAmount',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  delete r.registration;
  for (const field of JSON_FIELDS) {
    if (r[field] && typeof r[field] === 'object') {
      r[field] = JSON.stringify(r[field]);
    }
  }
  return toStringRecord(r);
}

function fromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (JSON_FIELDS.includes(key) && typeof value === 'string' && value) {
      try { result[key] = JSON.parse(value); } catch { result[key] = value; }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const eventRegistrationItemSelectionRepository = {
  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.eventRegistrationItemSelection.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByRegistrationId(registrationId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.eventRegistrationItemSelection.findMany({ where: { registrationId } });
    return rows.map(toRecord);
  },

  /** Non-cancelled selections for an item, across all registrations for its event — used for capacity checks. */
  async findActiveByItemId(itemId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.eventRegistrationItemSelection.findMany({
      where: { itemId, status: { not: 'cancelled' } },
    });
    return rows.map(toRecord);
  },

  /** Count of non-cancelled entries of one Activity item's entry type — capacity is per-entry, not per-participant. */
  async countActiveByItemAndEntryType(itemId: string, entryTypeKey: string): Promise<number> {
    return prisma.eventRegistrationItemSelection.count({
      where: { itemId, entryTypeKey, status: { not: 'cancelled' } },
    });
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventRegistrationItemSelection.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const parsed = fromRecord(data);
    const input: Record<string, unknown> = {};
    Object.keys(parsed).forEach((key) => {
      if (UPDATABLE_FIELDS.has(key)) input[key] = parsed[key];
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventRegistrationItemSelection.update({ where: { id }, data: input as any });
    return toRecord(row);
  },
};
