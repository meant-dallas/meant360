# Year-End Accounting Process

## Overview
At year-end, you need to "close the books" by rolling current balances into new opening balances and resetting transfers.

## Current Balance Calculation
```
Current Balance = Opening Balance + Transfers In
```

## Year-End Process

### Option 1: Manual Process (Current System)

1. **Before Year-End:**
   - Generate and save the annual financial report for the year
   - Note down all current account balances from the Accounts page

2. **On Year-End:**
   - For each account, update the "Opening Balance" to match its current balance
   - This effectively captures all transfers into the opening balance
   - The transfers are still in the database but will only show for historical reports

3. **Database Impact:**
   - `fin_simple_accounts.openingBalance` - update to current balance
   - `fin_transaction_splits` - keep historical data (don't delete)

4. **Reporting:**
   - Historical reports will still show old splits correctly
   - New reports will start with updated opening balances
   - Current Balance continues to calculate: New Opening + New Transfers

### Option 2: Automated Year-End Close (Recommended)

Create a year-end close feature that:

1. **Calculates Final Balances:**
   - For each account, sum: Opening Balance + All Transfers In

2. **Archives the Year:**
   - Create a snapshot: `fin_year_end_snapshots` table
   - Store: year, account balances, total income, total expenses

3. **Resets for New Year:**
   - Update `openingBalance` to current balance for each account
   - Add `accountingYear` field to `fin_transaction_splits`
   - Tag all existing splits with the closed year (e.g., "2026")

4. **Reports Adjust:**
   - When calculating balances, only count splits from current year forward
   - Historical reports filter by accounting year

## Example: Life Membership Split Impact

**Year 1 (2026):**
- Savings Account Opening: $5,000
- Life Membership split: $875 transferred to Savings
- Current Balance: $5,875

**Year-End Close (Dec 31, 2026):**
- New Opening Balance for 2027: $5,875
- Archive: "2026 had $875 in transfers"

**Year 2 (2027):**
- Savings Account Opening: $5,875
- New transfers: $0 (starts fresh)
- Current Balance: $5,875 + new transfers

## Implementation Options

### Quick Fix (Manual)
Edit each account's opening balance on the Accounts page before January 1st.

### Proper Solution (Recommended)
Add a "Close Year" button that:
1. Creates year-end snapshot report
2. Updates all opening balances automatically
3. Tags historical splits with closed year
4. Prevents accidental re-processing of old splits

## Database Schema Addition (Optional)

```sql
-- Track which accounting year splits belong to
ALTER TABLE fin_transaction_splits ADD COLUMN accounting_year VARCHAR(4);

-- Snapshot table for historical year-end data
CREATE TABLE fin_year_end_snapshots (
  id VARCHAR PRIMARY KEY,
  year VARCHAR(4) NOT NULL,
  closed_date TIMESTAMP NOT NULL,
  accounts_snapshot JSONB NOT NULL,
  total_income DECIMAL(12,2),
  total_expenses DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Current Workaround

Until automated year-end close is implemented:

1. Generate annual report for the year (save PDF)
2. Go to Accounts page
3. For each account, click Edit
4. Update "Opening Balance" to the "Current Balance" shown
5. Save

This manually rolls forward the balances. The system will continue working correctly, showing:
- Opening Balance: $5,875 (manually updated)
- Transfers In: $0 (only new year's splits)
- Current Balance: $5,875

All historical reports filtered by date will still work correctly because they query transactions by date, not accounting year.
