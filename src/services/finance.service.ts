import { createCrudService } from './crud.service';
import { deleteFile } from '@/lib/blob-storage';
import { createLedgerEntry } from '@/lib/services/ledger.service';
import type { CreateLedgerEntryInput } from '@/lib/services/ledger.service';
import { incomeRepository, expenseRepository } from '@/repositories';

// ========================================
// Finance Services (Income, Expenses)
// ========================================

const VALID_PAYMENT_METHODS: CreateLedgerEntryInput['paymentMethod'][] = ['PAYPAL', 'ZELLE', 'SQUARE', 'CASH', 'CHECK', 'BANK'];

function incomeTypeToLedgerSource(incomeType: string): CreateLedgerEntryInput['source'] {
  const t = (incomeType || '').toLowerCase();
  if (t.includes('membership')) return 'MEMBERSHIP';
  if (t.includes('event') || t.includes('guest fee')) return 'EVENT';
  if (t.includes('sponsor')) return 'SPONSOR';
  if (t.includes('donation')) return 'DONATION';
  if (t.includes('refund')) return 'REIMBURSEMENT';
  return 'ADJUSTMENT';
}

function expenseToLedgerSource(expenseType: string, needsReimbursement: string): CreateLedgerEntryInput['source'] {
  if (String(needsReimbursement || '').toLowerCase() === 'true') return 'REIMBURSEMENT';
  if ((expenseType || '').toLowerCase() === 'event') return 'EVENT';
  return 'ADJUSTMENT';
}

const baseIncomeService = createCrudService({
  repository: incomeRepository,
  entityName: 'Income',
  getEntityLabel: (r) => `${r.incomeType || 'Income'} - ${r.payerName || r.id}`,
  buildCreateRecord: (data, now) => ({
    incomeType: String(data.incomeType || 'Other'),
    eventName: String(data.eventName || ''),
    amount: Number(data.amount || 0),
    date: String(data.date || now.split('T')[0]),
    paymentMethod: String(data.paymentMethod || ''),
    payerName: String(data.payerName || ''),
    notes: String(data.notes || ''),
  }),
});

export const incomeService = {
  ...baseIncomeService,
  async create(
    data: Record<string, unknown>,
    audit?: { userEmail: string },
  ): Promise<Record<string, string | number>> {
    const created = await baseIncomeService.create(data, audit);
    await createLedgerEntry({
      date: new Date(created.date as string),
      type: 'INCOME',
      source: incomeTypeToLedgerSource(created.incomeType as string),
      amount: Number(created.amount) || 0,
      paymentMethod:
        created.paymentMethod && VALID_PAYMENT_METHODS.includes(created.paymentMethod as CreateLedgerEntryInput['paymentMethod'])
          ? (created.paymentMethod as CreateLedgerEntryInput['paymentMethod'])
          : null,
      referenceId: created.id as string,
      referenceType: 'INCOME',
    });
    return created;
  },
};

const baseExpenseService = createCrudService({
  repository: expenseRepository,
  entityName: 'Expense',
  getEntityLabel: (r) => String(r.description || r.category || r.id),
  buildCreateRecord: (data, now) => {
    const needsReimb = String(data.needsReimbursement || '').toLowerCase() === 'true';
    return {
      expenseType: String(data.expenseType || 'General'),
      eventName: String(data.eventName || ''),
      category: String(data.category || 'Miscellaneous'),
      description: String(data.description || ''),
      amount: Number(data.amount || 0),
      date: String(data.date || now.split('T')[0]),
      paidBy: String(data.paidBy || 'Organization'),
      receiptUrl: String(data.receiptUrl || ''),
      receiptFileId: String(data.receiptFileId || ''),
      notes: String(data.notes || ''),
      needsReimbursement: needsReimb ? 'true' : '',
      reimbStatus: needsReimb ? 'Pending' : '',
      reimbMethod: '',
      reimbAmount: needsReimb ? Number(data.amount || 0) : '',
      approvedBy: '',
      approvedDate: '',
      reimbursedDate: '',
    };
  },
  onBeforeDelete: async (record) => {
    if (record.receiptFileId) {
      await deleteFile(record.receiptFileId);
    }
  },
});

export const expenseService = {
  ...baseExpenseService,
  async create(
    data: Record<string, unknown>,
    audit?: { userEmail: string },
  ): Promise<Record<string, string | number>> {
    const created = await baseExpenseService.create(data, audit);
    await createLedgerEntry({
      date: new Date(created.date as string),
      type: 'EXPENSE',
      source: expenseToLedgerSource(
        created.expenseType as string,
        created.needsReimbursement as string,
      ),
      amount: Number(created.amount) || 0,
      referenceId: created.id as string,
      referenceType: 'EXPENSE',
      notes: (created.description as string) || (created.notes as string) || undefined,
    });
    return created;
  },
};

/**
 * Handle expense reimbursement status workflow: auto-set dates on status change.
 */
export async function updateExpenseReimbursementStatus(
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, string>> {
  const record = await expenseService.getById(id);
  const now = new Date().toISOString();

  const updated: Record<string, string> = {
    ...record,
    ...data,
    updatedAt: now,
  };

  if (data.reimbStatus === 'Approved' && record.reimbStatus !== 'Approved') {
    updated.approvedDate = now.split('T')[0];
  }
  if (data.reimbStatus === 'Reimbursed' && record.reimbStatus !== 'Reimbursed') {
    updated.reimbursedDate = now.split('T')[0];
  }

  return expenseRepository.update(id, updated);
}
