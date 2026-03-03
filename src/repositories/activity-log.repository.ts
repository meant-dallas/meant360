import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const JSON_FIELDS = ['changedFields', 'oldValues', 'newValues'];

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

export const activityLogRepository = {
  async findAll(): Promise<Record<string, string>[]> {
    const rows = await prisma.activityLog.findMany();
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.activityLog.create({ data: input as any });
    return toRecord(row);
  },
};
