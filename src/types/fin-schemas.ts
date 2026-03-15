import { z } from 'zod';

// ========================================
// Financial Subsystem Zod Schemas
// ========================================

// --- Shared ---

export const finProvider = z.enum(['square', 'paypal', 'bank', 'manual']);
export const finTransactionType = z.enum(['payment', 'fee', 'payout', 'deposit', 'withdrawal', 'refund', 'manual']);
export const finStatus = z.enum(['NEW', 'CLASSIFIED', 'SPLIT', 'LEDGERED', 'RECONCILED']);
export const finLedgerType = z.enum(['income', 'expense', 'fee', 'refund', 'transfer']);
export const finAccountType = z.enum(['asset', 'liability', 'income', 'expense', 'equity']);
export const finCategoryType = z.enum(['income', 'expense']);
export const finArStatus = z.enum(['pending', 'partial', 'received', 'cancelled']);
export const finApStatus = z.enum(['pending', 'partial', 'paid', 'cancelled']);
export const finArSourceType = z.enum(['sponsor', 'event', 'membership', 'other']);
export const finApSourceType = z.enum(['venue', 'vendor', 'reimbursement', 'other']);

const decimalString = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a valid decimal (up to 2 places)');
const coerceDecimal = z.coerce.number();

// --- Categories ---

export const finCategoryCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: finCategoryType,
});

export const finCategoryUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  type: finCategoryType.optional(),
});

// --- Manual Transaction ---

export const finTransactionCreateSchema = z.object({
  provider: finProvider.default('manual'),
  type: finTransactionType.default('manual'),
  grossAmount: coerceDecimal,
  fee: coerceDecimal.default(0),
  netAmount: coerceDecimal.optional(),
  currency: z.string().default('USD'),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional().or(z.literal('')),
  description: z.string().optional(),
  transactionDate: z.string().min(1, 'Transaction date is required'),
  categoryId: z.string().optional(),
  eventId: z.string().optional(),
  memberId: z.string().optional(),
  notes: z.string().optional(),
});

export const finTransactionUpdateSchema = z.object({
  categoryId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
});

// --- Classification (bulk) ---

export const finClassifySchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1, 'Category is required'),
  eventId: z.string().optional(),
});

// --- Splits ---

export const finSplitItemSchema = z.object({
  categoryId: z.string().optional(),
  amount: coerceDecimal,
  eventId: z.string().optional(),
  memberId: z.string().optional(),
  notes: z.string().optional(),
});

export const finSplitCreateSchema = z.object({
  transactionId: z.string().min(1),
  splits: z.array(finSplitItemSchema).min(1),
});

// --- Ledger ---

export const finLedgerGenerateSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
});

// --- Reconciliation ---

export const finReconciliationCreateSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(2, 'At least 2 transactions required'),
  notes: z.string().optional(),
});

export const finReconciliationUndoSchema = z.object({
  reconcileGroupId: z.string().min(1),
});

export const finReconciliationSuggestSchema = z.object({
  bankTransactionId: z.string().min(1),
});

// --- Accounts Receivable ---

export const finReceivableCreateSchema = z.object({
  sourceType: finArSourceType,
  sourceId: z.string().optional(),
  partyName: z.string().min(1, 'Party name is required'),
  amount: coerceDecimal.refine((v) => v > 0, 'Amount must be positive'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const finReceivableUpdateSchema = z.object({
  partyName: z.string().min(1).optional(),
  amount: coerceDecimal.optional(),
  receivedAmount: coerceDecimal.optional(),
  status: finArStatus.optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().optional(),
});

// --- Accounts Payable ---

export const finPayableCreateSchema = z.object({
  vendorName: z.string().min(1, 'Vendor name is required'),
  sourceType: finApSourceType,
  sourceId: z.string().optional(),
  amount: coerceDecimal.refine((v) => v > 0, 'Amount must be positive'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const finPayableUpdateSchema = z.object({
  vendorName: z.string().min(1).optional(),
  amount: coerceDecimal.optional(),
  paidAmount: coerceDecimal.optional(),
  status: finApStatus.optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().optional(),
});

// --- Bank CSV Upload ---

export const finBankRowSchema = z.object({
  date: z.string().min(1),
  description: z.string().optional(),
  amount: coerceDecimal,
  reference: z.string().optional(),
});

export const finBankUploadSchema = z.object({
  rows: z.array(finBankRowSchema).min(1),
});

// --- Reports ---

export const finReportQuerySchema = z.object({
  reportType: z.enum([
    'monthly-income',
    'monthly-expenses',
    'event-income',
    'membership-income',
    'annual-summary',
    'receivables',
    'payables',
    'processing-fees',
    'account-balances',
  ]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().optional(),
  year: z.coerce.number().optional(),
});
