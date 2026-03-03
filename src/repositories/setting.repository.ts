import { prisma } from '@/lib/db';

export const settingRepository = {
  async getAll(): Promise<Record<string, string>> {
    const rows = await prisma.setting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value || '';
    }
    return settings;
  },

  async upsert(key: string, value: string, updatedBy: string): Promise<void> {
    const now = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key },
      update: { value, updatedAt: now, updatedBy },
      create: { key, value, updatedAt: now, updatedBy },
    });
  },
};
