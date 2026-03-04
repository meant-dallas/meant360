import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const memberMembershipRepository = {
  async findAll(): Promise<Record<string, string>[]> {
    const rows = await prisma.memberMembership.findMany();
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.memberMembership.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByMemberId(memberId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.memberMembership.findMany({
      where: { memberId },
      orderBy: { year: 'desc' },
    });
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberMembership.create({ data: data as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberMembership.update({ where: { id }, data: data as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.memberMembership.delete({ where: { id } });
  },

  async deleteByMemberId(memberId: string): Promise<void> {
    const rows = await prisma.memberMembership.findMany({ where: { memberId } });
    for (const row of rows) {
      await prisma.memberMembership.delete({ where: { id: row.id } });
    }
  },
};
