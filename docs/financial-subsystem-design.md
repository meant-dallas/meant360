# Financial Accounting Subsystem - Design Document

**Project:** MEANT360
**Date:** 2026-03-14
**Status:** Design finalized, pending implementation

---

## 1. Overview

A new financial accounting subsystem that operates independently from existing tables (`income`, `expenses`, `sponsors`, `transactions`). The existing system remains untouched. The new subsystem uses a `fin_` table prefix for clear isolation.

The system only considers transactions from **January 1, 2026** onward. No backfill or migration from existing tables is required.

### Workflow

```
External Payment (Square / PayPal / Bank CSV / Manual)
  |
  v
Raw Transaction Storage (fin_raw_transactions)
  |
  v
Transaction Review / Classification (assign category)
  |
  v
Transaction Splitting (break into accounting components)
  |
  v
Ledger Entry Generation (double-entry)
  |
  v
Bank Reconciliation (match processor payouts to bank deposits)
  |
  v
Financial Reports
```

### Transaction Lifecycle States

```
NEW        --> just imported, untouched
CLASSIFIED --> category assigned (manual or auto)
SPLIT      --> broken into accounting components (TransactionSplit records created)
LEDGERED   --> ledger entries generated from splits
RECONCILED --> matched to bank record via reconciliation group
```

---

## 2. Design Decisions

### 2.1 Table Naming

All new tables use the `fin_` prefix to avoid confusion with existing tables (e.g., existing `transactions` vs new `fin_raw_transactions`).

### 2.2 Monetary Values

All financial amounts use `Decimal @db.Decimal(12,2)` — never `Float`. This prevents floating-point rounding errors in accounting calculations.

### 2.3 Repository Pattern

The new subsystem does NOT use the legacy `Record<string, string>` repository pattern from `base.repository.ts`. Services work directly with typed Prisma models. This is a clean break from the old Google Sheets-era pattern.

### 2.4 Double-Entry Ledger

The ledger uses double-entry accounting. Each ledger entry records a `debitAccountId` and `creditAccountId` from a chart of accounts (`fin_accounts`). This ensures accounting integrity: total debits always equal total credits.

### 2.5 Categories as Reference Table

Income/expense categories are stored in `fin_categories` (not free text). This allows UI management and prevents inconsistent labels.

### 2.6 AR/AP Without Categories

Accounts Receivable and Accounts Payable do not use categories. They track obligations using `sourceType`, `sourceId`, `partyName`/`vendorName`, and payment status.

### 2.7 Sign Convention for Transactions

Amounts are stored with their **natural sign** as they come from the source:

- Customer payment received (Square/PayPal): **positive**
- Processor fee deducted: **negative** (stored as separate row)
- Processor payout/transfer to bank: **negative** (from processor API)
- Bank deposit: **positive** (from CSV)
- Bank withdrawal/debit: **negative** (from CSV)

No artificial sign flipping is needed. The processor's own payout record is the natural negative counterpart to the bank deposit.

### 2.8 Processor Fees as Separate Rows

Each Square/PayPal sync creates separate transaction rows for payments and fees. This enables:
- Accurate fee reporting from the ledger
- Clean reconciliation groups
- Fees visible as their own line items

---

## 3. Database Schema

### 3.1 fin_categories

Reference table for income/expense classification.

```
fin_categories
--------------
id              String    @id @default(cuid())
name            String    (e.g., "Membership", "Event Ticket", "Venue", "Food")
type            String    ("income" | "expense")
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

### 3.2 fin_accounts

Chart of accounts for double-entry ledger.

```
fin_accounts
------------
id              String    @id @default(cuid())
name            String    (e.g., "Cash", "Membership Income", "Processing Fees")
type            String    ("asset" | "liability" | "income" | "expense" | "equity")
code            String    @unique (e.g., "1000", "4001", "5001")
description     String?
isActive        Boolean   @default(true)
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

Default accounts to seed:

| Code | Name | Type |
|------|------|------|
| 1000 | Cash - Bank | asset |
| 1010 | Cash - Square | asset |
| 1020 | Cash - PayPal | asset |
| 1100 | Accounts Receivable | asset |
| 2000 | Accounts Payable | liability |
| 3000 | Reserve Fund | equity |
| 4000 | Membership Income | income |
| 4001 | Life Membership Income | income |
| 4010 | Event Income | income |
| 4020 | Sponsorship Income | income |
| 4030 | Donation Income | income |
| 5000 | Venue Expense | expense |
| 5001 | Food Expense | expense |
| 5002 | Decorations Expense | expense |
| 5003 | Printing Expense | expense |
| 5004 | Technology Expense | expense |
| 5010 | Processing Fees | expense |
| 5020 | Refunds | expense |

### 3.3 fin_raw_transactions

Stores ALL financial transactions from all sources without modification.

```
fin_raw_transactions
--------------------
id                  String    @id @default(cuid())
provider            String    ("square" | "paypal" | "bank" | "manual")
externalId          String?   @unique (null for manual/bank entries)
type                String    ("payment" | "fee" | "payout" | "deposit" | "withdrawal" | "refund" | "manual")
grossAmount         Decimal   @db.Decimal(12,2)
fee                 Decimal   @db.Decimal(12,2) @default(0)
netAmount           Decimal   @db.Decimal(12,2)
currency            String    @default("USD")
payerName           String?
payerEmail          String?
description         String?
transactionDate     DateTime  (when payment occurred)
metadata            Json?     (raw provider data)
status              String    @default("NEW")  (NEW | CLASSIFIED | SPLIT | LEDGERED | RECONCILED)
categoryId          String?   -> fin_categories
eventId             String?   -> events
memberId            String?   -> members
notes               String?

// Reconciliation fields
reconciled          Boolean   @default(false)
reconcileGroupId    String?   -> fin_reconciliation_groups
reconciledAt        DateTime?

createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt
```

Deduplication: `externalId` unique constraint prevents re-importing the same processor transaction.

### 3.4 fin_transaction_splits

Breaks a single transaction into multiple accounting components.

```
fin_transaction_splits
----------------------
id              String    @id @default(cuid())
transactionId   String    -> fin_raw_transactions
categoryId      String?   -> fin_categories
amount          Decimal   @db.Decimal(12,2)
eventId         String?   -> events
memberId        String?   -> members
notes           String?
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

**Constraint:** `SUM(splits.amount)` must equal the parent transaction's `grossAmount`.

### 3.5 fin_ledger_entries

Double-entry ledger recording all financial impact.

```
fin_ledger_entries
------------------
id                  String    @id @default(cuid())
date                DateTime  (event date for reporting)
transactionDate     DateTime  (when payment occurred)
type                String    ("income" | "expense" | "fee" | "refund" | "transfer")
categoryId          String?   -> fin_categories
amount              Decimal   @db.Decimal(12,2)
debitAccountId      String    -> fin_accounts
creditAccountId     String    -> fin_accounts
sourceTransactionId String?   -> fin_raw_transactions
sourceSplitId       String?   -> fin_transaction_splits
description         String?
createdAt           DateTime  @default(now())
```

**Integrity rule:** Total debits always equal total credits across the entire ledger.

### 3.6 fin_reconciliation_groups

Groups of transactions whose amounts sum to zero, proving money flow from processor to bank.

```
fin_reconciliation_groups
-------------------------
id              String    @id @default(cuid())
notes           String?
createdAt       DateTime  @default(now())
createdBy       String    (user email)
```

### 3.7 fin_bank_deposits

Stores rows imported from bank CSV statements.

```
fin_bank_deposits
-----------------
id              String    @id @default(cuid())
date            DateTime
description     String?
amount          Decimal   @db.Decimal(12,2)
reference       String?   (check number, reference ID)
rawData         Json?     (original CSV row)
transactionId   String?   -> fin_raw_transactions (linked after import creates a raw transaction)
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

Bank CSV import creates both a `fin_bank_deposits` record (preserving original data) and a corresponding `fin_raw_transactions` record (for unified processing).

### 3.8 fin_accounts_receivable

Tracks money owed TO the organization.

```
fin_accounts_receivable
-----------------------
id              String    @id @default(cuid())
sourceType      String    ("sponsor" | "event" | "membership" | "other")
sourceId        String?   (reference to related entity)
partyName       String
amount          Decimal   @db.Decimal(12,2)
receivedAmount  Decimal   @db.Decimal(12,2) @default(0)
status          String    @default("pending")  (pending | partial | received | cancelled)
dueDate         DateTime?
notes           String?
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

**Report formula:** AR as of date = `SUM(amount - receivedAmount) WHERE createdAt <= reportDate AND status IN ('pending', 'partial')`

### 3.9 fin_accounts_payable

Tracks money the organization OWES.

```
fin_accounts_payable
--------------------
id              String    @id @default(cuid())
vendorName      String
sourceType      String    ("venue" | "vendor" | "reimbursement" | "other")
sourceId        String?   (reference to related entity)
amount          Decimal   @db.Decimal(12,2)
paidAmount      Decimal   @db.Decimal(12,2) @default(0)
status          String    @default("pending")  (pending | partial | paid | cancelled)
dueDate         DateTime?
notes           String?
createdAt       DateTime  @default(now())
updatedAt       DateTime  @updatedAt
```

**Report formula:** AP as of date = `SUM(amount - paidAmount) WHERE createdAt <= reportDate AND status IN ('pending', 'partial')`

---

## 4. Reconciliation Design

### 4.1 How It Works

Reconciliation links processor transactions to bank deposits without modifying financial data. It only proves that money moved from the processor to the bank.

### 4.2 Zero-Sum Rule

A reconciliation group is valid when `SUM(amount) = 0` across all transactions in the group.

This works naturally because of the sign convention:

```
Example: Two Square payments with fees, settled as one bank deposit

Square Payment       +60.00   (customer paid)
Square Payment       +60.00   (customer paid)
Square Fee            -5.40   (processor deducted)
Square Fee            -5.40   (processor deducted)
Square Payout       -109.20   (processor transferred to bank)

At this point, processor-side sums to 0 already.

Bank Deposit        +109.20   (arrived at bank)
Square Payout       -109.20   (left processor)
                    --------
                       0.00   (reconciled)
```

Reconciliation can happen at two levels:
1. **Processor-to-bank:** Match payout records to bank deposits (simple)
2. **Full audit:** Group payments + fees + payout + bank deposit (complete trace)

### 4.3 APIs

**POST /api/fin/reconciliation/create**
- Input: `{ transactionIds: string[] }`
- Validates all transactions are unreconciled
- Validates `SUM(amount) = 0`
- Creates `fin_reconciliation_groups` record
- Updates transactions: `reconciled = true`, `reconcileGroupId`, `reconciledAt`

**POST /api/fin/reconciliation/undo**
- Input: `{ reconcileGroupId: string }`
- Clears reconciliation fields on all transactions in group
- Deletes the group record

### 4.4 Suggest Match Algorithm (v1)

When a bank deposit is selected:
1. Find unreconciled processor transactions within +/- 3 days of the deposit date
2. Try combinations whose `SUM(netAmount)` equals the bank deposit amount
3. Pre-select matching rows for user confirmation

---

## 5. Reporting

All reports query the `fin_ledger_entries` table. Supported reports:

| Report | Filter |
|--------|--------|
| Monthly income | date range, grouped by month |
| Monthly expenses | date range, grouped by month |
| Income by event | eventId via splits |
| Income by membership type | categoryId |
| Annual financial report | year, all types |
| Accounts receivable | as-of date |
| Accounts payable | as-of date |
| Processing fee report | category = Processing Fees |
| Account balances | as-of date, by account |

Reports support filtering by:
- `transactionDate` (when payment occurred)
- `date` (event date / reporting date)

---

## 6. UI Plan

### 6.1 Sidebar

Add a top-level "Accounting" section in the admin sidebar with sub-items:

- **Transactions** — unified transaction table (import, classify, split)
- **Ledger** — double-entry ledger view
- **Reconciliation** — bank reconciliation workflow
- **AR / AP** — accounts receivable and payable
- **Reports** — financial reports

### 6.2 Reconciliation Page

**Transaction Table Columns:**
- Checkbox selector
- Date
- Source (square / paypal / bank / manual)
- Type (payment / fee / payout / deposit)
- Description
- Amount
- Category
- Event
- Reconciled status (green/gray indicator)

**Filters:**
- Status: All | Unreconciled | Reconciled
- Source: All | Square | PayPal | Bank | Manual
- Date Range
- Default view: Unreconciled transactions

**Selection Summary Panel** (above table):
```
Selected Transactions: 4
Total: 0.00           <-- enables Reconcile button
```

If total is not zero:
```
Selected Transactions: 3
Total: 5.40
Difference: 5.40      <-- Reconcile button disabled
```

**Actions:**
- `[Reconcile Selected]` — enabled only when SUM = 0
- `[Suggest Match]` — auto-selects matching processor rows for a selected bank deposit
- `[Undo Reconciliation]` — shown when viewing reconciled rows

**Reconciliation Group Detail:**
Clicking a reconciled transaction shows the group:
```
Reconciliation Group #abc123

Square Payment       +60.00
Square Payment       +60.00
Square Fee            -5.40
Square Fee            -5.40
Square Payout       -109.20
Bank Deposit        +109.20
---------------------------
Total                  0.00
```

---

## 7. Service Layer

### 7.1 Services to Create

| Service | Responsibility |
|---------|---------------|
| `fin-transaction.service.ts` | Import from Square/PayPal/CSV/manual, deduplication |
| `fin-classification.service.ts` | Category assignment, status transitions |
| `fin-split.service.ts` | Transaction splitting, amount validation |
| `fin-ledger.service.ts` | Ledger entry generation from splits, double-entry logic |
| `fin-reconciliation.service.ts` | Reconciliation group management, suggest-match |
| `fin-receivable.service.ts` | AR CRUD, balance-as-of-date queries |
| `fin-payable.service.ts` | AP CRUD, balance-as-of-date queries |
| `fin-reports.service.ts` | Report queries against ledger |

### 7.2 API Routes

All new routes under `/api/fin/`:

```
/api/fin/transactions          GET (list), POST (import/manual create)
/api/fin/transactions/sync     POST (sync from Square/PayPal)
/api/fin/transactions/upload   POST (bank CSV upload)
/api/fin/transactions/[id]     GET, PUT (classify), DELETE

/api/fin/splits                POST (create splits for a transaction)
/api/fin/splits/[id]           PUT, DELETE

/api/fin/ledger                GET (list entries with filters)
/api/fin/ledger/generate       POST (generate ledger from splits)

/api/fin/reconciliation/create POST
/api/fin/reconciliation/undo   POST
/api/fin/reconciliation/suggest POST (suggest match)

/api/fin/receivables           GET, POST
/api/fin/receivables/[id]      GET, PUT, DELETE

/api/fin/payables              GET, POST
/api/fin/payables/[id]         GET, PUT, DELETE

/api/fin/reports               GET (with report type + filters)
/api/fin/accounts              GET (list chart of accounts)
/api/fin/categories            GET, POST, PUT, DELETE
```

---

## 8. Implementation Order

| Phase | Scope |
|-------|-------|
| 1 | Prisma schema (all 9 tables) + migration |
| 2 | Seed script for default accounts + categories |
| 3 | Transaction ingestion (Square, PayPal, Bank CSV, Manual) |
| 4 | Classification + split services + APIs |
| 5 | Double-entry ledger generation |
| 6 | AR/AP services + APIs |
| 7 | Reconciliation service + APIs |
| 8 | Reporting queries |
| 9 | UI: Sidebar + Ledger page + Reconciliation page + Transaction management |

---

## 9. Important Rules

- Reconciliation NEVER modifies LedgerEntry or TransactionSplit — it only links transactions
- The ledger is the immutable accounting source of truth
- Existing tables (`income`, `expenses`, `sponsors`, `transactions`) are never modified
- All new APIs use the `/api/fin/` prefix
- All new tables use the `fin_` prefix
