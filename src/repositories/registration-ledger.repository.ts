import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const JSON_FIELDS = ['snapshot'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const r = { ...row };
  for (const field of JSON_FIELDS) {
    if (r[field] && typeof r[field] === 'object') {
      r[field] = JSON.stringify(r[field]);
    }
  }
  return toStringRecord(r);
}

function fromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (JSON_FIELDS.includes(key) && typeof value === 'string' && value) {
      try { result[key] = JSON.parse(value); } catch { result[key] = value; }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Insert-only by design — a financial/registration history ledger must never
// be mutated or deleted after the fact. No update() or delete() is exposed
// here on purpose; do not add them.
export const registrationLedgerRepository = {
  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.registrationLedgerEntry.create({ data: input as any });
    return toRecord(row);
  },

  /** All entries for one registration attempt (one EventParticipant row), oldest first. */
  async findByParticipantId(participantId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.registrationLedgerEntry.findMany({
      where: { participantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  },

  /** Full history for a person at an event, across every registration/cancellation cycle. */
  async findByEventIdAndEmail(eventId: string, email: string): Promise<Record<string, string>[]> {
    const rows = await prisma.registrationLedgerEntry.findMany({
      where: { eventId, email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  },

  /** Full history for an event, for admin reporting. */
  async findByEventId(eventId: string): Promise<Record<string, string>[]> {
    const rows = await prisma.registrationLedgerEntry.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  },
};
