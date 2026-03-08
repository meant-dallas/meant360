import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const orgInfoRepository = {
  async get(): Promise<Record<string, string> | null> {
    const row = await prisma.orgInfo.findFirst();
    return row ? toRecord(row) : null;
  },

  async upsert(data: Record<string, unknown>): Promise<Record<string, string>> {
    const existing = await prisma.orgInfo.findFirst();
    if (existing) {
      const row = await prisma.orgInfo.update({
        where: { id: existing.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any,
      });
      return toRecord(row);
    }
    const row = await prisma.orgInfo.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
    });
    return toRecord(row);
  },
};
