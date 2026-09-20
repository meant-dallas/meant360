import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const UPDATABLE_FIELDS = new Set(['name', 'age', 'checkedInAt']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  delete r.registration;
  return toStringRecord(r);
}

export const eventRegistrationParticipantRepository = {
  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.eventRegistrationParticipant.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async findByRegistrationId(registrationId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.eventRegistrationParticipant.findMany({ where: { registrationId } });
    return rows.map(toRecord);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventRegistrationParticipant.create({ data: data as any });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input: Record<string, unknown> = {};
    Object.keys(data).forEach((key) => {
      if (UPDATABLE_FIELDS.has(key)) input[key] = data[key];
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.eventRegistrationParticipant.update({ where: { id }, data: input as any });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.eventRegistrationParticipant.delete({ where: { id } });
  },
};
