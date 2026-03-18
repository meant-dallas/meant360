export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { finCategoryCreateSchema, finCategoryUpdateSchema } from '@/types/fin-schemas';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const categories = await prisma.finCategory.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return jsonResponse(categories);
  } catch (error) {
    return errorResponse('Failed to list categories', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finCategoryCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const category = await prisma.finCategory.create({ data: parsed });
    return jsonResponse(category, 201);
  } catch (error) {
    return errorResponse('Failed to create category', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(finCategoryUpdateSchema, body);
    if (parsed instanceof Response) return parsed;

    const { id, ...data } = parsed;
    const category = await prisma.finCategory.update({ where: { id }, data });
    return jsonResponse(category);
  } catch (error) {
    return errorResponse('Failed to update category', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { id } = await request.json();
    if (!id) return errorResponse('id is required', 400);

    // Check if category is in use
    const count = await prisma.finRawTransaction.count({ where: { categoryId: id } });
    if (count > 0) {
      return errorResponse(`Cannot delete: ${count} transaction(s) use this category`, 400);
    }

    await prisma.finCategory.delete({ where: { id } });
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse('Failed to delete category', 500, error);
  }
}
