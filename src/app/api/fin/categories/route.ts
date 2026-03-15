export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { finCategoryCreateSchema } from '@/types/fin-schemas';

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
