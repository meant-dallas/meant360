import { getRows, appendRow, getRowById, updateRow, deleteRow } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

// ========================================
// Generic CRUD Service Factory
// ========================================

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface CrudServiceConfig {
  sheetName: string;
  entityName: string;
  buildCreateRecord: (data: Record<string, unknown>, now: string) => Record<string, string | number>;
  onBeforeDelete?: (record: Record<string, string>) => Promise<void>;
}

export function createCrudService(config: CrudServiceConfig) {
  const { sheetName, entityName, buildCreateRecord, onBeforeDelete } = config;

  return {
    async list(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
      let rows = await getRows(sheetName);
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value != null) {
            rows = rows.filter((r) => r[key] === value);
          }
        }
      }
      return rows;
    },

    async getById(id: string): Promise<{ record: Record<string, string>; rowIndex: number }> {
      const result = await getRowById(sheetName, id);
      if (!result) throw new NotFoundError(entityName);
      return result;
    },

    async create(data: Record<string, unknown>): Promise<Record<string, string | number>> {
      const now = new Date().toISOString();
      const record = {
        id: generateId(),
        ...buildCreateRecord(data, now),
        createdAt: now,
        updatedAt: now,
      };
      await appendRow(sheetName, record);
      return record;
    },

    async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
      const existing = await getRowById(sheetName, id);
      if (!existing) throw new NotFoundError(entityName);

      const updated: Record<string, string> = {
        ...existing.record,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await updateRow(sheetName, existing.rowIndex, updated);
      return updated;
    },

    async remove(id: string): Promise<void> {
      const existing = await getRowById(sheetName, id);
      if (!existing) throw new NotFoundError(entityName);

      if (onBeforeDelete) {
        await onBeforeDelete(existing.record);
      }

      await deleteRow(sheetName, existing.rowIndex);
    },
  };
}
