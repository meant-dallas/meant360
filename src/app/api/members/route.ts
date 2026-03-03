import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { memberCreateSchema, memberUpdateSchema } from '@/types/schemas';
import { memberService, searchMembers } from '@/services/members.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const rows = await searchMembers(search || '', {
      membershipType: searchParams.get('membershipType'),
      status: searchParams.get('status'),
    });
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/members error:', error);
    return errorResponse('Failed to fetch members', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(memberCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await memberService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/members error:', error);
    return errorResponse('Failed to create member', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(memberUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await memberService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/members error:', error);
    return errorResponse('Failed to update member', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await memberService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/members error:', error);
    return errorResponse('Failed to delete member', 500, error);
  }
}
