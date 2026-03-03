import { createCrudService } from './crud.service';
import { deleteFile } from '@/lib/blob-storage';
import { incomeRepository, expenseRepository } from '@/repositories';

// ========================================
// Finance Services (Income, Expenses)
// ========================================

export const incomeService = createCrudService({
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

export const expenseService = createCrudService({
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
