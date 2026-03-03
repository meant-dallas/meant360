import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const committeeRepository = {
  async findAll(): Promise<Record<string, string>[]> {
    const rows = await prisma.committeeMember.findMany();
    return rows.map(toRecord);
  },

  async findByEmail(email: string): Promise<Record<string, string> | null> {
    const row = await prisma.committeeMember.findUnique({ where: { email } });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.committeeMember.create({ data: data as any });
    return toRecord(row);
  },

  async update(email: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.committeeMember.update({ where: { email }, data: data as any });
    return toRecord(row);
  },

  async delete(email: string): Promise<void> {
    await prisma.committeeMember.delete({ where: { email } });
  },
};
