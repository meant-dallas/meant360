export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { finSimpleAccountCreateSchema, finSimpleAccountUpdateSchema } from '@/types/fin-schemas';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const accounts = await prisma.finSimpleAccount.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    // Calculate current balance for each account by adding splits
    const accountsWithBalances = await Promise.all(
      accounts.map(async (account) => {
        // Get all splits that transfer money to this account
        const splits = await prisma.finTransactionSplit.findMany({
          where: { accountName: account.name },
        });

        const transfersIn = splits.reduce((sum, split) => sum + Number(split.amount), 0);
        const currentBalance = Number(account.openingBalance) + transfersIn;

        return {
          ...account,
          openingBalance: String(account.openingBalance),
          transfersIn,
          currentBalance,
        };
      })
    );

    return jsonResponse(accountsWithBalances);
  } catch (error) {
    return errorResponse('Failed to list accounts', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finSimpleAccountCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const account = await prisma.finSimpleAccount.create({
      data: {
        name: parsed.name,
        openingBalance: new Prisma.Decimal(parsed.openingBalance),
        notes: parsed.notes ?? null,
        sortOrder: parsed.sortOrder,
      },
    });
    return jsonResponse(account, 201);
  } catch (error) {
    return errorResponse('Failed to create account', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return errorResponse('id is required', 400);

    const parsed = await validateBody(finSimpleAccountUpdateSchema, rest);
    if (parsed instanceof Response) return parsed;

    const updateData: Prisma.FinSimpleAccountUpdateInput = {};
    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.openingBalance !== undefined) updateData.openingBalance = new Prisma.Decimal(parsed.openingBalance);
    if (parsed.notes !== undefined) updateData.notes = parsed.notes;
    if (parsed.sortOrder !== undefined) updateData.sortOrder = parsed.sortOrder;

    const account = await prisma.finSimpleAccount.update({ where: { id }, data: updateData });
    return jsonResponse(account);
  } catch (error) {
    return errorResponse('Failed to update account', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { id } = await request.json();
    if (!id) return errorResponse('id is required', 400);
    await prisma.finSimpleAccount.delete({ where: { id } });
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse('Failed to delete account', 500, error);
  }
}
