import { prisma } from '@/lib/db';
import { finTransactionService } from '@/services/fin-transaction.service';

// This repository is the backing store for the Expenses page's manually-
// entered, reimbursable expenses. It operates on FinRawTransaction rows
// scoped to provider:'manual', type:'expense' — the unified ledger table —
// rather than the legacy, now-retired `Expense` model. Synced provider rows
// (Square/PayPal/Zelle) are managed on the Transactions ledger page instead
// and are never touched here.
//
// The legacy Expense page's free-text `category` string doesn't map 1:1
// onto today's FinCategory names — three of the ten legacy category labels
// are deliberately folded onto existing, differently-named categories
// instead of getting their own row (see scripts/add-missing-expense-categories.ts
// for the rest, which do get their own identically-named category).
const CATEGORY_LABEL_TO_FIN_NAME: Record<string, string> = {
  Venue: 'Venue Rental',
  Admin: 'Admin - Tech',
  Catering: 'Food Expenses',
};
const FIN_NAME_TO_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_LABEL_TO_FIN_NAME).map(([label, finName]) => [finName, label]),
);

async function resolveCategoryId(legacyLabel: string): Promise<string | null> {
  const finName = CATEGORY_LABEL_TO_FIN_NAME[legacyLabel] ?? legacyLabel;
  const category = await prisma.finCategory.findFirst({ where: { name: finName, type: 'expense' } });
  return category?.id ?? null;
}

async function resolveEventId(eventName: string): Promise<string | null> {
  if (!eventName) return null;
  const event = await prisma.event.findFirst({ where: { name: eventName } });
  return event?.id ?? null;
}

function toDateString(d: Date | null | undefined): string {
  return d ? d.toISOString().split('T')[0] : '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const metadata = (row.metadata ?? {}) as { expenseType?: string };
  const categoryLabel = row.category ? (FIN_NAME_TO_CATEGORY_LABEL[row.category.name] ?? row.category.name) : 'Miscellaneous';
  return {
    id: row.id,
    expenseType: metadata.expenseType ?? (row.eventId ? 'Event' : 'General'),
    eventName: row.event?.name ?? '',
    category: categoryLabel,
    description: row.description ?? '',
    amount: String(row.grossAmount),
    date: toDateString(row.transactionDate),
    paidBy: row.payerName ?? 'Organization',
    receiptUrl: row.receiptUrl ?? '',
    receiptFileId: row.receiptFileId ?? '',
    notes: row.notes ?? '',
    needsReimbursement: row.reimbursementStatus != null ? 'true' : '',
    reimbStatus: row.reimbursementStatus ?? '',
    reimbMethod: row.reimbursementMethod ?? '',
    reimbAmount: row.reimbursementAmount != null ? String(row.reimbursementAmount) : '',
    approvedBy: row.approvedBy ?? '',
    approvedDate: toDateString(row.approvedDate),
    reimbursedDate: toDateString(row.reimbursedDate),
    createdAt: row.createdAt ? row.createdAt.toISOString() : '',
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
  };
}

async function fromRecord(data: Record<string, unknown>) {
  const str = (v: unknown) => (v == null ? '' : String(v));
  const needsReimb = str(data.needsReimbursement).toLowerCase() === 'true';
  const eventName = str(data.eventName);
  const [categoryId, eventId] = await Promise.all([
    resolveCategoryId(str(data.category) || 'Miscellaneous'),
    eventName ? resolveEventId(eventName) : Promise.resolve(null),
  ]);

  return {
    categoryId: categoryId ?? undefined,
    // '' means "no event selected" (General-type expense) — resolve to an
    // explicit null so clearing an event on edit actually unsets eventId,
    // rather than a non-empty name that failed to resolve, which leaves the
    // existing value alone instead of guessing.
    eventId: eventName ? eventId ?? undefined : null,
    description: str(data.description),
    grossAmount: parseFloat(str(data.amount)) || 0,
    transactionDate: str(data.date) || new Date().toISOString().split('T')[0],
    payerName: str(data.paidBy) || 'Organization',
    receiptUrl: str(data.receiptUrl),
    receiptFileId: str(data.receiptFileId),
    notes: str(data.notes),
    reimbursementStatus: needsReimb ? str(data.reimbStatus) || 'Pending' : null,
    reimbursementMethod: needsReimb ? str(data.reimbMethod) || undefined : null,
    reimbursementAmount: needsReimb ? parseFloat(str(data.reimbAmount)) || parseFloat(str(data.amount)) || 0 : null,
    approvedBy: needsReimb ? str(data.approvedBy) || undefined : null,
    approvedDate: needsReimb ? str(data.approvedDate) || undefined : null,
    reimbursedDate: needsReimb ? str(data.reimbursedDate) || undefined : null,
    metadata: { expenseType: str(data.expenseType) || 'General' },
  };
}

const include = { category: true, event: true } as const;

export const expenseRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { provider: 'manual', type: 'expense' };

    if (filters?.eventName) {
      const eventId = await resolveEventId(filters.eventName);
      if (!eventId) return []; // named event doesn't exist — nothing can match
      where.eventId = eventId;
    }
    if (filters?.category) {
      const categoryId = await resolveCategoryId(filters.category);
      if (!categoryId) return [];
      where.categoryId = categoryId;
    }
    if (filters?.needsReimbursement === 'true') {
      where.reimbursementStatus = { not: null };
    } else if (filters?.needsReimbursement != null) {
      where.reimbursementStatus = null;
    }
    if (filters?.reimbStatus) where.reimbursementStatus = filters.reimbStatus;
    if (filters?.paidBy) where.payerName = filters.paidBy;

    const rows = await prisma.finRawTransaction.findMany({ where, include });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.finRawTransaction.findUnique({ where: { id }, include });
    if (!row || row.provider !== 'manual' || row.type !== 'expense') return null;
    return toRecord(row);
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const mapped = await fromRecord(data);
    const created = await finTransactionService.create({
      id: data.id ? String(data.id) : undefined,
      provider: 'manual',
      type: 'expense',
      ...mapped,
    });
    return this.findById(created.id) as Promise<Record<string, string>>;
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const mapped = await fromRecord(data);
    await finTransactionService.update(id, mapped);
    return this.findById(id) as Promise<Record<string, string>>;
  },

  async delete(id: string): Promise<void> {
    await finTransactionService.delete(id);
  },
};
