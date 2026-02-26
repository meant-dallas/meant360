import { SHEET_TABS } from '@/types';
import { createCrudService } from './crud.service';
import { deleteFile } from '@/lib/blob-storage';

// ========================================
// Finance Services (Income, Expenses, Reimbursements)
// ========================================

export const incomeService = createCrudService({
  sheetName: SHEET_TABS.INCOME,
  entityName: 'Income record',
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
  sheetName: SHEET_TABS.EXPENSES,
  entityName: 'Expense record',
  buildCreateRecord: (data, now) => ({
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
  }),
  onBeforeDelete: async (record) => {
    if (record.receiptFileId) {
      await deleteFile(record.receiptFileId);
    }
  },
});

export const reimbursementService = createCrudService({
  sheetName: SHEET_TABS.REIMBURSEMENTS,
  entityName: 'Reimbursement record',
  buildCreateRecord: (data) => ({
    expenseId: String(data.expenseId || ''),
    requestedBy: String(data.requestedBy || ''),
    amount: Number(data.amount || 0),
    description: String(data.description || ''),
    eventName: String(data.eventName || ''),
    category: String(data.category || ''),
    receiptUrl: String(data.receiptUrl || ''),
    receiptFileId: String(data.receiptFileId || ''),
    status: 'Pending',
    approvedBy: '',
    approvedDate: '',
    reimbursedDate: '',
    notes: String(data.notes || ''),
  }),
});

/**
 * Handle reimbursement status workflow: auto-set dates on status change.
 */
export async function updateReimbursementWithWorkflow(
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, string>> {
  const { record, rowIndex } = await reimbursementService.getById(id);
  const now = new Date().toISOString();

  const updated: Record<string, string> = {
    ...record,
    ...data,
    updatedAt: now,
  };

  if (data.status === 'Approved' && record.status !== 'Approved') {
    updated.approvedDate = now.split('T')[0];
  }
  if (data.status === 'Reimbursed' && record.status !== 'Reimbursed') {
    updated.reimbursedDate = now.split('T')[0];
  }

  const { updateRow } = await import('@/lib/google-sheets');
  await updateRow(SHEET_TABS.REIMBURSEMENTS, rowIndex, updated);
  return updated;
}
