import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { expenseCreateSchema, expenseUpdateSchema } from '@/types/schemas';
import { expenseService, updateExpenseReimbursementStatus } from '@/services/finance.service';
import { NotFoundError } from '@/services/crud.service';
import { logActivity } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rows = await expenseService.list({
      eventName: searchParams.get('event'),
      category: searchParams.get('category'),
      needsReimbursement: searchParams.get('needsReimbursement'),
      reimbStatus: searchParams.get('reimbStatus'),
    });

    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const year = searchParams.get('year');
    if (year && !startDate && !endDate) {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
    let filtered = rows;
    if (startDate) filtered = filtered.filter((r) => r.date >= startDate);
    if (endDate) filtered = filtered.filter((r) => r.date <= endDate);

    return jsonResponse(filtered);
  } catch (error) {
    console.error('GET /api/expenses error:', error);
    return errorResponse('Failed to fetch expense records', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(expenseCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await expenseService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/expenses error:', error);
    return errorResponse('Failed to create expense record', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(expenseUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    // If reimbStatus is in the body, use reimbursement workflow
    if (validated.reimbStatus) {
      const updated = await updateExpenseReimbursementStatus(
        validated.id,
        validated as unknown as Record<string, unknown>,
      );

      logActivity({
        userEmail: auth.email,
        action: 'update',
        entityType: 'Expense',
        entityId: validated.id,
        entityLabel: `${updated.description || updated.category || validated.id}`,
        description: `Updated reimbursement status to ${updated.reimbStatus}`,
      });

      return jsonResponse(updated);
    }

    const updated = await expenseService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/expenses error:', error);
    return errorResponse('Failed to update expense record', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await expenseService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/expenses error:', error);
    return errorResponse('Failed to delete expense record', 500, error);
  }
}
