import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { committeeMemberCreateSchema, committeeMemberUpdateSchema } from '@/types/schemas';
import { committeeRepository } from '@/repositories/committee.repository';
import { logActivity } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await committeeRepository.findAll();
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/committee error:', error);
    return errorResponse('Failed to fetch committee members', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(committeeMemberCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await committeeRepository.findByEmail(validated.email);
    if (existing) return errorResponse('A committee member with this email already exists', 409);

    const record = await committeeRepository.create({
      ...validated,
      addedAt: new Date().toISOString(),
      addedBy: auth.email,
    });

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'CommitteeMember',
      entityId: validated.email,
      entityLabel: validated.name,
      description: `Added committee member ${validated.name} (${validated.email})`,
    });

    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/committee error:', error);
    return errorResponse('Failed to create committee member', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(committeeMemberUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await committeeRepository.findByEmail(validated.email);
    if (!existing) return errorResponse('Committee member not found', 404);

    const { email, ...updateData } = validated;
    const record = await committeeRepository.update(email, updateData);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'CommitteeMember',
      entityId: email,
      entityLabel: record.name || existing.name,
      description: `Updated committee member ${record.name || existing.name}`,
      oldRecord: existing,
      newRecord: record,
    });

    return jsonResponse(record);
  } catch (error) {
    console.error('PUT /api/committee error:', error);
    return errorResponse('Failed to update committee member', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    if (!email) return errorResponse('Missing email');

    const existing = await committeeRepository.findByEmail(email);
    if (!existing) return errorResponse('Committee member not found', 404);

    await committeeRepository.delete(email);

    logActivity({
      userEmail: auth.email,
      action: 'delete',
      entityType: 'CommitteeMember',
      entityId: email,
      entityLabel: existing.name || email,
      description: `Removed committee member ${existing.name || email}`,
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/committee error:', error);
    return errorResponse('Failed to delete committee member', 500, error);
  }
}
