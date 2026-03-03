import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const JSON_FIELDS = ['selectedActivities', 'customFields', 'priceBreakdown'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  // Remove relation objects if included
  delete r.event;
  delete r.member;
  delete r.guest;
  // memberId/guestId: null → ''
  if (r.memberId === null) r.memberId = '';
  if (r.guestId === null) r.guestId = '';
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
    } else if (key === 'memberId' || key === 'guestId') {
      result[key] = value === '' ? null : value || null;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const eventParticipantRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = {};
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.eventParticipant.findMany({ where: where as any });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.eventParticipant.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByEventId(eventId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.eventParticipant.findMany({ where: { eventId } });
    return rows.map(toRecord);
  },

  async findByEventIdAndEmail(eventId: string, email: string): Promise<Record<string, string> | null> {
    const row = await prisma.eventParticipant.findFirst({
      where: { eventId, email: { equals: email, mode: 'insensitive' } },
    });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventParticipant.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventParticipant.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.eventParticipant.delete({ where: { id } });
  },
};
