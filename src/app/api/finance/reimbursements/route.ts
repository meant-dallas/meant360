import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, requireCommitteeOrAdmin, validateBody } from '@/lib/api-helpers';
import { reimbursementCreateSchema, reimbursementUpdateSchema } from '@/types/schemas';
import { reimbursementService, updateReimbursementWithWorkflow } from '@/services/finance.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rows = await reimbursementService.list({
      status: searchParams.get('status'),
      eventName: searchParams.get('event'),
      requestedBy: searchParams.get('requestedBy'),
    });
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/reimbursements error:', error);
    return errorResponse('Failed to fetch reimbursement records', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCommitteeOrAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(reimbursementCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await reimbursementService.create(validated as unknown as Record<string, unknown>);
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/reimbursements error:', error);
    return errorResponse('Failed to create reimbursement record', 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(reimbursementUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await updateReimbursementWithWorkflow(validated.id, validated as unknown as Record<string, unknown>);
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/reimbursements error:', error);
    return errorResponse('Failed to update reimbursement record', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await reimbursementService.remove(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/reimbursements error:', error);
    return errorResponse('Failed to delete reimbursement record', 500);
  }
}
