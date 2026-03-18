import { z } from 'zod';

// ========================================
// Financial Subsystem Zod Schemas (Simplified)
// ========================================

// --- Shared ---

export const finProvider = z.enum(['square', 'paypal', 'zelle', 'manual']);
export const finTransactionType = z.enum(['income', 'expense']);
export const finStatus = z.enum(['Completed', 'Pending']);
export const finCategoryType = z.enum(['income', 'expense']);
export const finArStatus = z.enum(['pending', 'partial', 'received', 'cancelled']);
export const finApStatus = z.enum(['pending', 'partial', 'paid', 'cancelled']);
export const finArSourceType = z.enum(['sponsor', 'event', 'membership', 'other']);
export const finApSourceType = z.enum(['venue', 'vendor', 'reimbursement', 'other']);

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
  type: finTransactionType,
  grossAmount: coerceDecimal,
  fee: coerceDecimal.default(0),
  netAmount: coerceDecimal.optional(),
  currency: z.string().default('USD'),
  payerName: z.string().optional(),
  payerEmail: z.string().email().optional().or(z.literal('')),
  description: z.string().optional(),
  transactionDate: z.string().min(1, 'Transaction date is required'),
  status: finStatus.default('Completed'),
  categoryId: z.string().optional(),
  eventId: z.string().optional(),
  memberId: z.string().optional(),
  notes: z.string().optional(),
  excluded: z.boolean().default(false),
});

export const finTransactionUpdateSchema = z.object({
  categoryId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
  excluded: z.boolean().optional(),
  status: finStatus.optional(),
  type: finTransactionType.optional(),
  grossAmount: coerceDecimal.optional(),
  fee: coerceDecimal.optional(),
});

// --- Classification (bulk categorize) ---

export const finClassifySchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1, 'Category is required'),
  eventId: z.string().optional(),
});

// --- Splits (life membership) ---

export const finSplitItemSchema = z.object({
  categoryId: z.string().optional(),
  amount: coerceDecimal,
  accountName: z.string().optional(),
  eventId: z.string().optional(),
  memberId: z.string().optional(),
  notes: z.string().optional(),
});

export const finSplitCreateSchema = z.object({
  transactionId: z.string().min(1),
  splits: z.array(finSplitItemSchema).min(1),
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

// --- Zelle CSV Upload ---

export const finZelleRowSchema = z.object({
  date: z.string().min(1),
  description: z.string().optional(),
  amount: coerceDecimal,
  type: finTransactionType.default('income'),
});

export const finZelleUploadSchema = z.object({
  rows: z.array(finZelleRowSchema).min(1),
});

// --- Simple Account ---

export const finSimpleAccountCreateSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  openingBalance: coerceDecimal.default(0),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
});

export const finSimpleAccountUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  openingBalance: coerceDecimal.optional(),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
});

// --- Reports ---

export const finReportQuerySchema = z.object({
  reportType: z.enum([
    'monthly-income',
    'monthly-expenses',
    'annual-summary',
    'event-summary',
    'receivables',
    'payables',
  ]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventId: z.string().optional(),
});
