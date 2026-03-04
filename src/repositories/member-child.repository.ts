import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const memberChildRepository = {
  async findAll(): Promise<Record<string, string>[]> {
    const rows = await prisma.memberChild.findMany();
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.memberChild.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByMemberId(memberId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.memberChild.findMany({
      where: { memberId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberChild.create({ data: data as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberChild.update({ where: { id }, data: data as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.memberChild.delete({ where: { id } });
  },

  async deleteByMemberId(memberId: string): Promise<void> {
    const rows = await prisma.memberChild.findMany({ where: { memberId } });
    for (const row of rows) {
      await prisma.memberChild.delete({ where: { id: row.id } });
    }
  },
};
