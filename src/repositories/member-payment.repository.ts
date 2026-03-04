import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const memberPaymentRepository = {
  async findAll(): Promise<Record<string, string>[]> {
    const rows = await prisma.memberPayment.findMany();
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.memberPayment.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByMemberId(memberId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.memberPayment.findMany({ where: { memberId } });
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberPayment.create({ data: data as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.memberPayment.update({ where: { id }, data: data as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.memberPayment.delete({ where: { id } });
  },

  async deleteByMemberId(memberId: string): Promise<void> {
    const rows = await prisma.memberPayment.findMany({ where: { memberId } });
    for (const row of rows) {
      await prisma.memberPayment.delete({ where: { id: row.id } });
    }
  },
};
