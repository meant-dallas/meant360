import { generateId } from '@/lib/utils';
import { logActivity } from '@/lib/audit-log';

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

export interface CrudRepository {
  findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]>;
  findById(id: string): Promise<Record<string, string> | null>;
  create(data: Record<string, unknown>): Promise<Record<string, string>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, string>>;
  delete(id: string): Promise<void>;
}

interface CrudServiceConfig {
  repository: CrudRepository;
  entityName: string;
  buildCreateRecord: (data: Record<string, unknown>, now: string) => Record<string, string | number>;
  onBeforeDelete?: (record: Record<string, string>) => Promise<void>;
  getEntityLabel?: (record: Record<string, string | number>) => string;
}

export function createCrudService(config: CrudServiceConfig) {
  const { repository, entityName, buildCreateRecord, onBeforeDelete, getEntityLabel } = config;

  const label = (record: Record<string, string | number>) =>
    getEntityLabel ? getEntityLabel(record) : String(record.name || record.id || '');

  return {
    async list(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
      return repository.findAll(filters);
    },

    async getById(id: string): Promise<Record<string, string>> {
      const result = await repository.findById(id);
      if (!result) throw new NotFoundError(entityName);
      return result;
    },

    async create(data: Record<string, unknown>, audit?: { userEmail: string }): Promise<Record<string, string | number>> {
      const now = new Date().toISOString();
      const record = {
        id: generateId(),
        ...buildCreateRecord(data, now),
        createdAt: now,
        updatedAt: now,
      };
      const created = await repository.create(record);

      if (audit) {
        logActivity({
          userEmail: audit.userEmail,
          action: 'create',
          entityType: entityName,
          entityId: String(record.id),
          entityLabel: label(record),
          newRecord: record,
        });
      }

      return created;
    },

    async update(id: string, data: Record<string, unknown>, audit?: { userEmail: string }): Promise<Record<string, string>> {
      const existing = await repository.findById(id);
      if (!existing) throw new NotFoundError(entityName);

      const updated: Record<string, string> = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const result = await repository.update(id, updated);

      if (audit) {
        logActivity({
          userEmail: audit.userEmail,
          action: 'update',
          entityType: entityName,
          entityId: id,
          entityLabel: label(result),
          oldRecord: existing,
          newRecord: result,
        });
      }

      return result;
    },

    async remove(id: string, audit?: { userEmail: string }): Promise<void> {
      const existing = await repository.findById(id);
      if (!existing) throw new NotFoundError(entityName);

      if (onBeforeDelete) {
        await onBeforeDelete(existing);
      }

      await repository.delete(id);

      if (audit) {
        logActivity({
          userEmail: audit.userEmail,
          action: 'delete',
          entityType: entityName,
          entityId: id,
          entityLabel: label(existing),
          oldRecord: existing,
        });
      }
    },
  };
}
