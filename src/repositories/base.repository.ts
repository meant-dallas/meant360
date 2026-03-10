/**
 * Converts a Prisma result object to Record<string, string>.
 * This preserves the contract the service layer expects (Record<string, string>).
 */
export function toStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = '';
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else if (typeof value === 'number') {
      result[key] = String(value);
    } else if (typeof value === 'boolean') {
      result[key] = value ? 'true' : '';
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
