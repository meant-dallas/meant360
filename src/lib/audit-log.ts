import { activityLogRepository } from '@/repositories';
import { type AuditAction } from '@/types';
import { generateId } from '@/lib/utils';

interface LogActivityParams {
  userEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  description?: string;
  oldRecord?: Record<string, string | number>;
  newRecord?: Record<string, string | number>;
}

const SKIP_FIELDS = new Set(['updatedAt', 'createdAt']);

export function computeDiff(
  oldRecord: Record<string, string | number>,
  newRecord: Record<string, string | number>,
): { changedFields: string[]; oldValues: Record<string, string>; newValues: Record<string, string> } {
  const changedFields: string[] = [];
  const oldValues: Record<string, string> = {};
  const newValues: Record<string, string> = {};

  const allKeys = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]));
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    const oldVal = String(oldRecord[key] ?? '');
    const newVal = String(newRecord[key] ?? '');
    if (oldVal !== newVal) {
      changedFields.push(key);
      oldValues[key] = oldVal;
      newValues[key] = newVal;
    }
  }

  return { changedFields, oldValues, newValues };
}

export function buildDescription(
  action: AuditAction,
  entityType: string,
  entityLabel: string,
  changedFields?: string[],
  oldValues?: Record<string, string>,
  newValues?: Record<string, string>,
): string {
  const verb = action === 'create' ? 'Created' : action === 'update' ? 'Updated' : 'Deleted';
  let desc = `${verb} ${entityType}: ${entityLabel}`;

  if (action === 'update' && changedFields?.length && oldValues && newValues) {
    const changes = changedFields.slice(0, 3).map((f) => `${f}: ${oldValues[f]} -> ${newValues[f]}`);
    desc += ` [${changes.join(', ')}${changedFields.length > 3 ? ', ...' : ''}]`;
  }

  return desc;
}

export function logActivity(params: LogActivityParams): void {
  const { userEmail, action, entityType, entityId, entityLabel, oldRecord, newRecord } = params;

  let changedFields: string[] = [];
  let oldValues: Record<string, string> = {};
  let newValues: Record<string, string> = {};

  if (action === 'update' && oldRecord && newRecord) {
    const diff = computeDiff(oldRecord, newRecord);
    changedFields = diff.changedFields;
    oldValues = diff.oldValues;
    newValues = diff.newValues;
  } else if (action === 'create' && newRecord) {
    newValues = Object.fromEntries(
      Object.entries(newRecord).filter(([k]) => !SKIP_FIELDS.has(k)).map(([k, v]) => [k, String(v)]),
    );
  } else if (action === 'delete' && oldRecord) {
    oldValues = Object.fromEntries(
      Object.entries(oldRecord).filter(([k]) => !SKIP_FIELDS.has(k)).map(([k, v]) => [k, String(v)]),
    );
  }

  const description = params.description || buildDescription(action, entityType, entityLabel, changedFields, oldValues, newValues);

  // Fire-and-forget
  activityLogRepository.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    userEmail,
    action,
    entityType,
    entityId,
    entityLabel,
    description,
    changedFields: JSON.stringify(changedFields),
    oldValues: JSON.stringify(oldValues),
    newValues: JSON.stringify(newValues),
  }).catch((err) => {
    console.error('Failed to write activity log:', err);
  });
}
