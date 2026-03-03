import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  // membershipYears: String[] → comma-separated string
  if (Array.isArray(r.membershipYears)) {
    r.membershipYears = (r.membershipYears as string[]).join(',');
  }
  // children: Json → string
  if (r.children && typeof r.children === 'object') {
    r.children = JSON.stringify(r.children);
  }
  return toStringRecord(r);
}

function fromRecord(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'membershipYears' && typeof value === 'string') {
      result.membershipYears = value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (key === 'children' && typeof value === 'string') {
      try { result.children = JSON.parse(value); } catch { result.children = value; }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const memberRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = {};
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.member.findMany({ where: where as any });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.member.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.member.create({ data: input as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.member.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.member.delete({ where: { id } });
  },
};
