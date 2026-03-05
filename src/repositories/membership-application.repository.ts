import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const membershipApplicationRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.email) where.email = filters.email;
    const rows = await prisma.membershipApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.membershipApplication.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByEmail(email: string): Promise<Record<string, string>[]> {
    const rows = await prisma.membershipApplication.findMany({ where: { email } });
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.membershipApplication.create({ data: data as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.membershipApplication.update({ where: { id }, data: data as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.membershipApplication.delete({ where: { id } });
  },
};
