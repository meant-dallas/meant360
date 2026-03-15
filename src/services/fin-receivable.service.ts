import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export const finReceivableService = {
  async list(status?: string) {
    const where: Prisma.FinAccountsReceivableWhereInput = {};
    if (status) where.status = status;
    return prisma.finAccountsReceivable.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  },

  async getById(id: string) {
    return prisma.finAccountsReceivable.findUnique({ where: { id } });
  },

  async create(data: {
    sourceType: string;
    sourceId?: string;
    partyName: string;
    amount: number;
    dueDate?: string;
    notes?: string;
  }) {
    return prisma.finAccountsReceivable.create({
      data: {
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
        partyName: data.partyName,
        amount: new Prisma.Decimal(data.amount),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes ?? null,
      },
    });
  },

  async update(id: string, data: {
    partyName?: string;
    amount?: number;
    receivedAmount?: number;
    status?: string;
    dueDate?: string | null;
    notes?: string;
  }) {
    const updateData: Prisma.FinAccountsReceivableUpdateInput = {};
    if (data.partyName !== undefined) updateData.partyName = data.partyName;
    if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
    if (data.receivedAmount !== undefined) updateData.receivedAmount = new Prisma.Decimal(data.receivedAmount);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Auto-compute status based on receivedAmount
    if (data.receivedAmount !== undefined) {
      const record = await prisma.finAccountsReceivable.findUnique({ where: { id } });
      if (record) {
        const total = Number(record.amount);
        if (data.receivedAmount >= total) {
          updateData.status = 'received';
        } else if (data.receivedAmount > 0) {
          updateData.status = 'partial';
        }
      }
    }

    return prisma.finAccountsReceivable.update({ where: { id }, data: updateData });
  },

  async delete(id: string) {
    return prisma.finAccountsReceivable.delete({ where: { id } });
  },

  async getStats() {
    const all = await prisma.finAccountsReceivable.findMany({
      where: { status: { in: ['pending', 'partial'] } },
    });
    const now = new Date();
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let overdueCount = 0;

    for (const ar of all) {
      const remaining = Number(ar.amount) - Number(ar.receivedAmount);
      totalOutstanding += remaining;
      if (ar.dueDate && ar.dueDate < now) {
        totalOverdue += remaining;
        overdueCount++;
      }
    }

    return {
      totalOutstanding,
      totalOverdue,
      overdueCount,
      pendingCount: all.length,
    };
  },
};
