/**
 * Single source of truth for the financial ledger's category buckets —
 * every FinCategory.type value, its display label/description/color, and
 * which buckets are offered when creating a new category. Shared between
 * server code (services) and client pages (Categories, Transactions) so
 * the dropdowns everywhere stay in sync instead of drifting independently.
 *
 * A category's bucket is authoritative over the raw ledger `type`
 * (income/expense) a transaction happened to sync in as — e.g. a PayPal
 * payout that PayPal itself labels "refund" but which is really a
 * member-reimbursement payout gets bucketed as 'reimbursement' via its
 * category, not treated as a real refund.
 *
 * 'reimbursement' and 'do_not_consider' both exist for money that's already
 * been counted once elsewhere in the ledger — counting it again would
 * double it. 'do_not_consider' is a legacy catch-all, kept only so existing
 * categories on it aren't orphaned; it's not offered for new categories.
 */
export type CategoryBucket = 'income' | 'expense' | 'refund' | 'reimbursement' | 'do_not_consider';

export const CATEGORY_BUCKET_ORDER: CategoryBucket[] = ['income', 'expense', 'refund', 'reimbursement', 'do_not_consider'];

/** Buckets offered when creating/editing a category — excludes the legacy catch-all. */
export const NEW_CATEGORY_BUCKETS: CategoryBucket[] = ['income', 'expense', 'refund', 'reimbursement'];

export const CATEGORY_BUCKET_LABELS: Record<CategoryBucket, string> = {
  income: 'Income',
  expense: 'Expense',
  refund: 'Refund',
  reimbursement: 'Reimbursement',
  do_not_consider: 'Do Not Consider (legacy)',
};

export const CATEGORY_BUCKET_DESCRIPTIONS: Record<CategoryBucket, string> = {
  income: 'Counts toward Total Income everywhere.',
  expense: 'Counts toward Total Expenses everywhere.',
  refund: 'Subtracted from Total Income (e.g. cancellation refunds).',
  reimbursement: 'A treasurer paying a member back for something already recorded as an Expense. Real money, shown in the transaction list, but excluded from Total Expenses to avoid double-counting the same cost.',
  do_not_consider: 'Legacy catch-all exclusion bucket. Not offered for new categories — use Reimbursement instead.',
};

export const CATEGORY_BUCKET_COLORS: Record<CategoryBucket, string> = {
  income: 'text-green-600',
  expense: 'text-red-600',
  refund: 'text-orange-600',
  reimbursement: 'text-purple-600',
  do_not_consider: 'text-gray-500',
};

const CATEGORY_BUCKET_SET = new Set<CategoryBucket>(CATEGORY_BUCKET_ORDER);

export function isCategoryBucket(value: string | null | undefined): value is CategoryBucket {
  return !!value && CATEGORY_BUCKET_SET.has(value as CategoryBucket);
}

/** Buckets that show up in the ledger but never contribute to any total. */
export function isExcludedBucket(bucket: CategoryBucket): boolean {
  return bucket === 'do_not_consider' || bucket === 'reimbursement';
}
