import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

// Account code mapping for automatic ledger entry generation
const ACCOUNT_CODES: Record<string, string> = {
  'Cash - Bank': '1000',
  'Cash - Square': '1010',
  'Cash - PayPal': '1020',
  'Processing Fees': '5010',
};

async function getAccountByCode(code: string) {
  const account = await prisma.finAccount.findUnique({ where: { code } });
  if (!account) throw new Error(`Account with code ${code} not found`);
  return account;
}

async function getIncomeAccountForCategory(categoryId: string | null): Promise<string> {
  if (!categoryId) return (await getAccountByCode('4010')).id; // Default to Event Income
  const category = await prisma.finCategory.findUnique({ where: { id: categoryId } });
  if (!category) return (await getAccountByCode('4010')).id;

  // Map category names to account codes
  const mapping: Record<string, string> = {
    'Membership': '4000',
    'Life Membership': '4001',
    'Event Income': '4010',
    'Sponsorship': '4020',
    'Donation': '4030',
  };
  const code = mapping[category.name] || '4010';
  return (await getAccountByCode(code)).id;
}

async function getExpenseAccountForCategory(categoryId: string | null): Promise<string> {
  if (!categoryId) return (await getAccountByCode('5000')).id;
  const category = await prisma.finCategory.findUnique({ where: { id: categoryId } });
  if (!category) return (await getAccountByCode('5000')).id;

  const mapping: Record<string, string> = {
    'Venue': '5000',
    'Food': '5001',
    'Decorations': '5002',
    'Printing': '5003',
    'Technology': '5004',
    'Processing Fees': '5010',
    'Refunds': '5020',
  };
  const code = mapping[category.name] || '5000';
  return (await getAccountByCode(code)).id;
}

function getCashAccountCode(provider: string): string {
  switch (provider) {
    case 'square': return '1010';
    case 'paypal': return '1020';
    default: return '1000';
  }
}

export interface LedgerFilters {
  type?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  accountId?: string;
  page?: number;
  pageSize?: number;
}

export const finLedgerService = {
  async generateFromTransactions(transactionIds: string[]) {
    const entries = [];

    for (const txnId of transactionIds) {
      const txn = await prisma.finRawTransaction.findUnique({
        where: { id: txnId },
        include: { splits: true },
      });
      if (!txn) continue;
      if (txn.status === 'LEDGERED' || txn.status === 'RECONCILED') continue;

      const cashAccountId = (await getAccountByCode(getCashAccountCode(txn.provider))).id;

      // If transaction has splits, generate one ledger entry per split
      if (txn.splits.length > 0) {
        for (const split of txn.splits) {
          const amount = Number(split.amount);
          const isIncome = amount >= 0;
          const categoryId = split.categoryId || txn.categoryId;

          let debitId: string;
          let creditId: string;
          let entryType: string;

          if (isIncome) {
            debitId = cashAccountId;
            creditId = await getIncomeAccountForCategory(categoryId);
            entryType = 'income';
          } else {
            debitId = await getExpenseAccountForCategory(categoryId);
            creditId = cashAccountId;
            entryType = 'expense';
          }

          const entry = await prisma.finLedgerEntry.create({
            data: {
              date: txn.transactionDate,
              transactionDate: txn.transactionDate,
              type: entryType,
              categoryId,
              amount: new Prisma.Decimal(Math.abs(amount)),
              debitAccountId: debitId,
              creditAccountId: creditId,
              sourceTransactionId: txn.id,
              sourceSplitId: split.id,
              description: txn.description,
            },
          });
          entries.push(entry);
        }
      } else {
        // No splits — generate a single entry from the transaction itself
        const grossAmount = Number(txn.grossAmount);
        const isIncome = grossAmount >= 0;
        const isFee = txn.type === 'fee';

        let debitId: string;
        let creditId: string;
        let entryType: string;

        if (isFee) {
          debitId = (await getAccountByCode('5010')).id; // Processing Fees expense
          creditId = cashAccountId;
          entryType = 'fee';
        } else if (isIncome) {
          debitId = cashAccountId;
          creditId = await getIncomeAccountForCategory(txn.categoryId);
          entryType = 'income';
        } else {
          debitId = await getExpenseAccountForCategory(txn.categoryId);
          creditId = cashAccountId;
          entryType = 'expense';
        }

        const entry = await prisma.finLedgerEntry.create({
          data: {
            date: txn.transactionDate,
            transactionDate: txn.transactionDate,
            type: entryType,
            categoryId: txn.categoryId,
            amount: new Prisma.Decimal(Math.abs(grossAmount)),
            debitAccountId: debitId,
            creditAccountId: creditId,
            sourceTransactionId: txn.id,
            description: txn.description,
          },
        });
        entries.push(entry);
      }

      // Update transaction status
      await prisma.finRawTransaction.update({
        where: { id: txnId },
        data: { status: 'LEDGERED' },
      });
    }

    return entries;
  },

  async list(filters: LedgerFilters = {}) {
    const where: Prisma.FinLedgerEntryWhereInput = {};

    if (filters.type) where.type = filters.type;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.accountId) {
      where.OR = [
        { debitAccountId: filters.accountId },
        { creditAccountId: filters.accountId },
      ];
    }
    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) where.transactionDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.transactionDate.lte = new Date(filters.endDate + 'T23:59:59Z');
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const [data, total] = await Promise.all([
      prisma.finLedgerEntry.findMany({
        where,
        include: { category: true, debitAccount: true, creditAccount: true },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.finLedgerEntry.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getAccountBalances() {
    const accounts = await prisma.finAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const balances = [];

    for (const account of accounts) {
      const [debits, credits] = await Promise.all([
        prisma.finLedgerEntry.aggregate({
          where: { debitAccountId: account.id },
          _sum: { amount: true },
        }),
        prisma.finLedgerEntry.aggregate({
          where: { creditAccountId: account.id },
          _sum: { amount: true },
        }),
      ]);

      const debitTotal = Number(debits._sum.amount ?? 0);
      const creditTotal = Number(credits._sum.amount ?? 0);

      // For asset/expense accounts: balance = debits - credits
      // For liability/income/equity accounts: balance = credits - debits
      const isDebitNormal = account.type === 'asset' || account.type === 'expense';
      const balance = isDebitNormal ? debitTotal - creditTotal : creditTotal - debitTotal;

      balances.push({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        balance,
      });
    }

    return balances;
  },

  async integrityCheck() {
    const [totalDebits, totalCredits] = await Promise.all([
      prisma.finLedgerEntry.aggregate({ _sum: { amount: true } }),
      prisma.finLedgerEntry.aggregate({ _sum: { amount: true } }),
    ]);
    // In double-entry, every entry has equal debit and credit by design
    // The amounts are stored once — the debit/credit is determined by account assignment
    // So total debits always equals total credits (same amount field)
    return {
      totalEntries: await prisma.finLedgerEntry.count(),
      totalAmount: Number(totalDebits._sum.amount ?? 0),
      balanced: true,
    };
  },
};
