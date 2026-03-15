import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finPayableService = {
  async list(status?: string) {
    const where: Prisma.FinAccountsPayableWhereInput = {};
    if (status) where.status = status;
    return prisma.finAccountsPayable.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  },

  async getById(id: string) {
    return prisma.finAccountsPayable.findUnique({ where: { id } });
  },

  async create(data: {
    vendorName: string;
    sourceType: string;
    sourceId?: string;
    amount: number;
    dueDate?: string;
    notes?: string;
  }) {
    return prisma.finAccountsPayable.create({
      data: {
        vendorName: data.vendorName,
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
        amount: new Prisma.Decimal(data.amount),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes ?? null,
      },
    });
  },

  async update(id: string, data: {
    vendorName?: string;
    amount?: number;
    paidAmount?: number;
    status?: string;
    dueDate?: string | null;
    notes?: string;
  }) {
    const updateData: Prisma.FinAccountsPayableUpdateInput = {};
    if (data.vendorName !== undefined) updateData.vendorName = data.vendorName;
    if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
    if (data.paidAmount !== undefined) updateData.paidAmount = new Prisma.Decimal(data.paidAmount);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.paidAmount !== undefined) {
      const record = await prisma.finAccountsPayable.findUnique({ where: { id } });
      if (record) {
        const total = Number(record.amount);
        if (data.paidAmount >= total) {
          updateData.status = 'paid';
        } else if (data.paidAmount > 0) {
          updateData.status = 'partial';
        }
      }
    }

    return prisma.finAccountsPayable.update({ where: { id }, data: updateData });
  },

  async delete(id: string) {
    return prisma.finAccountsPayable.delete({ where: { id } });
  },

  async getStats() {
    const all = await prisma.finAccountsPayable.findMany({
      where: { status: { in: ['pending', 'partial'] } },
    });
    const now = new Date();
    let totalUnpaid = 0;
    let totalOverdue = 0;
    let overdueCount = 0;

    for (const ap of all) {
      const remaining = Number(ap.amount) - Number(ap.paidAmount);
      totalUnpaid += remaining;
      if (ap.dueDate && ap.dueDate < now) {
        totalOverdue += remaining;
        overdueCount++;
      }
    }

    return {
      totalUnpaid,
      totalOverdue,
      overdueCount,
      pendingCount: all.length,
    };
  },
};
