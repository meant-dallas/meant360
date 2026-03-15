export const dynamic = 'force-dynamic';

import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const accounts = await prisma.finAccount.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return jsonResponse(accounts);
  } catch (error) {
    return errorResponse('Failed to list accounts', 500, error);
  }
}
