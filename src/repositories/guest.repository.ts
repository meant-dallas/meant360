import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

function fromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'eventsAttended') {
      result[key] = typeof value === 'string' ? parseInt(value, 10) || 0 : Number(value) || 0;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const guestRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = {};
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.guest.findMany({ where: where as any });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.guest.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.guest.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.guest.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.guest.delete({ where: { id } });
  },
};
