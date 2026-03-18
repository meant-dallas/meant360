-- Simplify Accounting Module Migration
-- This migration:
-- 1. Adds 'excluded' column to fin_raw_transactions
-- 2. Adds 'accountName' column to fin_transaction_splits
-- 3. Creates fin_simple_accounts table
-- 4. Updates status values from old pipeline to simple Completed/Pending
-- 5. Updates type values from old types to simple income/expense
-- Note: Old tables (fin_accounts, fin_ledger_entries, fin_reconciliation_groups, fin_bank_deposits)
--       are left in place to preserve data. They are no longer used by the application.

-- Step 1: Add excluded column to fin_raw_transactions
ALTER TABLE "fin_raw_transactions" ADD COLUMN IF NOT EXISTS "excluded" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "fin_raw_transactions_excluded_idx" ON "fin_raw_transactions"("excluded");

-- Step 2: Add accountName column to fin_transaction_splits
ALTER TABLE "fin_transaction_splits" ADD COLUMN IF NOT EXISTS "accountName" TEXT;

-- Step 3: Create fin_simple_accounts table
CREATE TABLE IF NOT EXISTS "fin_simple_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_simple_accounts_pkey" PRIMARY KEY ("id")
);

-- Step 4: Migrate status values
-- OLD: NEW, CLASSIFIED, SPLIT, LEDGERED, RECONCILED -> NEW: Completed, Pending
UPDATE "fin_raw_transactions"
SET "status" = 'Completed'
WHERE "status" IN ('CLASSIFIED', 'SPLIT', 'LEDGERED', 'RECONCILED');

UPDATE "fin_raw_transactions"
SET "status" = 'Completed'
WHERE "status" = 'NEW';

-- Step 5: Migrate type values
-- OLD: payment, fee, payout, deposit, withdrawal, refund, manual -> NEW: income, expense
UPDATE "fin_raw_transactions"
SET "type" = 'income'
WHERE "type" IN ('payment', 'deposit');

UPDATE "fin_raw_transactions"
SET "type" = 'expense'
WHERE "type" IN ('fee', 'payout', 'withdrawal', 'refund', 'manual');

-- Step 6: Drop old columns that are no longer used (safe - nullable columns)
-- We keep reconciled/reconcileGroupId/reconciledAt for now to not lose data
-- They are simply ignored by the application

-- Step 7: Remove old reconciliation indexes (optional cleanup)
-- DROP INDEX IF EXISTS "fin_raw_transactions_reconciled_idx";
-- DROP INDEX IF EXISTS "fin_raw_transactions_reconcileGroupId_idx";
