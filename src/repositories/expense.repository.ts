import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  delete r.event;
  if (r.eventId === null) r.eventId = '';
  return toStringRecord(r);
}

function fromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'amount' || key === 'reimbAmount') {
      result[key] = typeof value === 'string' ? parseFloat(value) || 0 : Number(value) || 0;
    } else if (key === 'eventId') {
      result[key] = value === '' ? null : value || null;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const expenseRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = {};
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.expense.findMany({ where: where as any });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.expense.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.expense.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.expense.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } });
  },
};
