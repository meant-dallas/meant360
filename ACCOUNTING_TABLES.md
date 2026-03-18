# Simplified Accounting Module - Database Tables

## Active Tables (Used by the Module)

### 1. **fin_raw_transactions**
- **Purpose**: Core transaction tracking for all income and expenses
- **Key Fields**:
  - `id`, `provider` (square/paypal/zelle/manual)
  - `type` (income/expense), `status` (Completed/Pending)
  - `grossAmount`, `fee`, `netAmount`
  - `transactionDate`, `description`, `payerName`, `payerEmail`
  - `categoryId` (FK to fin_categories)
  - `eventId` (FK to events)
  - `memberId` (FK to members)
  - `excluded` (boolean - exclude from reports)
  - `externalId`, `metadata`, `notes`

### 2. **fin_categories**
- **Purpose**: Income and expense categories
- **Key Fields**:
  - `id`, `name`, `type` (income/expense)
  - `description`, `sortOrder`

### 3. **fin_transaction_splits**
- **Purpose**: Split single transactions into multiple categories/accounts
- **Key Fields**:
  - `id`, `transactionId` (FK to fin_raw_transactions)
  - `categoryId` (FK to fin_categories) - optional
  - `accountName` (TEXT) - for non-category splits like "CD (Reserve)"
  - `amount`, `notes`
- **Use Case**: Life membership split ($125 income + remainder to savings)

### 4. **fin_simple_accounts**
- **Purpose**: Simple account tracking (Checking, Savings, CD)
- **Key Fields**:
  - `id`, `name`, `openingBalance`
  - `notes`, `sortOrder`

### 5. **fin_accounts_receivable**
- **Purpose**: Money owed to the organization
- **Key Fields**:
  - `id`, `partyName`, `amount`, `receivedAmount`
  - `dueDate`, `status` (pending/partial/paid)
  - `description`, `notes`

### 6. **fin_accounts_payable**
- **Purpose**: Bills the organization owes
- **Key Fields**:
  - `id`, `vendorName`, `amount`, `paidAmount`
  - `dueDate`, `status` (pending/partial/paid)
  - `description`, `notes`

## Deprecated Tables (No Longer Used)

These tables remain in the database to preserve historical data but are not accessed by the application.
**All stub services and API routes have been removed.**

### 1. **fin_accounts** (Old Chart of Accounts)
- Replaced by: Direct transaction categorization
- Data preserved: Yes
- Application references: **REMOVED** (no code references)

### 2. **fin_ledger_entries** (Old Double-Entry Ledger)
- Replaced by: Direct transaction queries
- Data preserved: Yes
- Application references: **REMOVED** (no code references)

### 3. **fin_reconciliation_groups** (Old Bank Reconciliation)
- Replaced by: Simple transaction tracking with exclude flag
- Data preserved: Yes
- Application references: **REMOVED** (no code references)

### 4. **fin_bank_deposits** (Old Deposit Tracking)
- Replaced by: Transaction-based tracking
- Data preserved: Yes
- Application references: **REMOVED** (no code references)

**Note:** These tables can be safely dropped from the database in the future if the historical data is no longer needed.

## Related Tables (Used Indirectly)

### **events**
- Referenced by `fin_raw_transactions.eventId`
- Used for event-based filtering and reporting

### **members**
- Referenced by `fin_raw_transactions.memberId`
- Used for member-specific transactions

## Data Flow

```
Square/PayPal/Zelle → fin_raw_transactions (with provider metadata)
                            ↓
                     Categories Assignment
                            ↓
                   Optional: fin_transaction_splits (for Life Membership, etc.)
                            ↓
                      Reports Generation
                   (queries transactions directly)
```

## Migration Notes

- Migration: `20260317000000_simplify_accounting`
- Status values migrated: NEW/CLASSIFIED/SPLIT/LEDGERED/RECONCILED → Completed
- Type values migrated: payment/deposit → income; fee/payout/withdrawal/refund/manual → expense
- New fields added: `excluded`, `accountName` (in splits)
- Old reconciliation fields kept but ignored: `reconciled`, `reconcileGroupId`, `reconciledAt`
