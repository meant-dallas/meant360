# Accounting Module Changes - Summary

## Changes Implemented

### 1. Dashboard (`src/app/(admin)/accounting/page.tsx`)
**Before:** Had "Quick Actions" section with 4 dashed boxes for Add Transaction, Sync Payments, Pending Money, and View Reports

**After:**
- Removed "Quick Actions" section entirely
- Added "Import Transactions" section with 3 styled buttons:
  - **Sync Square** (blue bg-blue-600)
  - **Sync PayPal** (purple bg-purple-600)
  - **Upload Zelle CSV** (green bg-green-600)

### 2. Reports Page (`src/app/(admin)/accounting/reports/page.tsx`)
**Before:**
- 6 separate report type buttons (Income Summary, Expense Summary, Annual Summary, Event Summary, Receivables, Payables)
- No event filtering
- Required clicking different buttons for different report types

**After:**
- Single consolidated "Financial Report" view
- Added **Event filter** dropdown with options:
  - "All Events (includes AR/AP)" - shows all income/expenses + money owed/bills
  - Individual events - shows only that event's income/expenses
- Single "Generate Report" button
- Automatically includes Money Owed and Bills Outstanding when no event selected
- Simplified report generation flow

### 3. Life Membership Split Logic
**Before:**
- Auto-split triggered when "Life Membership" category was assigned
- Automatically split $125 to income + remainder to CD (Reserve)
- No user control over splitting

**After:**
- **Removed auto-split logic** completely
- Added manual **"Split" button** in transactions table
- Button only appears for Life Membership transactions that:
  - Are categorized as "Life Membership"
  - Don't already have splits
  - Have amount > $125
- Split sends remainder to **"Savings Account"** (not CD)
- Shows confirmation dialog before splitting
- Displays success message with split amounts

**New Files Created:**
- `src/app/api/fin/transactions/split-life-membership/route.ts` - API endpoint for manual split

**Service Changes:**
- Removed `checkLifeMembershipSplit()` auto-trigger from `categorize()`
- Renamed method to `splitLifeMembership()` for manual invocation
- Changed destination account from "CD (Reserve)" to "Savings Account"

### 4. Reports Service (`src/services/fin-reports.service.ts`)
- Added `eventId` parameter to `monthlyIncome()`, `monthlyExpenses()`, `annualSummary()`
- Added `eventId` filtering to `getTransactions()` helper
- When `eventId` is provided:
  - Filters transactions to only that event
  - Skips event summary section
  - Skips AR/AP (receivables/payables) sections
- When no `eventId`:
  - Shows all transactions
  - Includes event summary
  - Includes AR/AP data

### 5. Reports API (`src/app/api/fin/reports/route.ts`)
- Added `eventId` query parameter support
- Passes `eventId` to service methods

## Database Tables Affected

### Active Tables:
1. **fin_raw_transactions** - Core transaction storage
2. **fin_categories** - Income/expense categories
3. **fin_transaction_splits** - Split transactions (Life Membership)
4. **fin_simple_accounts** - Savings, Checking, CD accounts
5. **fin_accounts_receivable** - Money owed to organization
6. **fin_accounts_payable** - Bills organization owes

### Unused/Deprecated Tables (preserved for historical data):
1. **fin_accounts** - Old chart of accounts
2. **fin_ledger_entries** - Old double-entry ledger
3. **fin_reconciliation_groups** - Old bank reconciliation
4. **fin_bank_deposits** - Old deposit tracking

See `ACCOUNTING_TABLES.md` for full documentation.

## UI/UX Improvements

### Dashboard
- Cleaner, more action-oriented layout
- Color-coded import buttons for quick visual identification
- Removed clutter of 4 generic action boxes

### Reports
- Simplified workflow - one report type instead of 6
- Event filtering adds powerful analysis capability
- Clear indication of what data is included (AR/AP vs. event-only)
- Reduced cognitive load for users

### Transactions
- Life Membership split is now explicit and user-controlled
- Visual "Split" button only appears when applicable
- Clear feedback on split amounts
- Preserves user agency over financial operations

## Key Benefits

1. **User Control**: Split operation requires explicit user action, preventing accidental splits
2. **Transparency**: Users see exactly what will happen before splitting
3. **Flexibility**: Event filtering allows targeted analysis
4. **Simplicity**: One report view instead of six reduces confusion
5. **Correctness**: Savings account is the proper destination for Life Membership reserves
6. **Clarity**: Color-coded buttons make import actions more obvious

## Migration Notes

- No database migration required for these changes
- Existing splits remain unchanged
- New splits will use "Savings Account" instead of "CD (Reserve)"
- All existing reports continue to work with new event filtering (eventId is optional)
