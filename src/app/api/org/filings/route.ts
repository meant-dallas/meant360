import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { orgFilingRepository } from '@/repositories';
import { deleteFile } from '@/lib/blob-storage';
import { logActivity } from '@/lib/audit-log';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const filingSchema = z.object({
  filingType: z.string().min(1, 'Filing type is required'),
  filingYear: z.string().default(''),
  filedDate: z.string().default(''),
  filedBy: z.string().default(''),
  confirmationNumber: z.string().default(''),
  status: z.enum(['Filed', 'Pending', 'Overdue']).default('Pending'),
  notes: z.string().default(''),
});

const filingUpdateSchema = z.object({
  id: z.string().min(1),
}).passthrough();

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const filingType = searchParams.get('filingType');
    const filters: Record<string, string | null | undefined> = {};
    if (filingType) filters.filingType = filingType;

    const rows = await orgFilingRepository.findAll(
      Object.keys(filters).length > 0 ? filters : undefined,
    );
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/org/filings error:', error);
    return errorResponse('Failed to fetch filings', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(filingSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await orgFilingRepository.create(validated as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'OrgFiling',
      entityId: record.id,
      entityLabel: `${validated.filingType} ${validated.filingYear}`,
    });

    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/org/filings error:', error);
    return errorResponse('Failed to create filing', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(filingUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await orgFilingRepository.findById(validated.id);
    if (!existing) return errorResponse('Filing not found', 404);

    const { id, ...data } = validated;
    const updated = await orgFilingRepository.update(id, data as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgFiling',
      entityId: id,
      entityLabel: `${updated.filingType} ${updated.filingYear}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/org/filings error:', error);
    return errorResponse('Failed to update filing', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    const existing = await orgFilingRepository.findById(id);
    if (!existing) return errorResponse('Filing not found', 404);

    if (existing.documentFileId) {
      await deleteFile(existing.documentFileId);
    }

    await orgFilingRepository.delete(id);

    logActivity({
      userEmail: auth.email,
      action: 'delete',
      entityType: 'OrgFiling',
      entityId: id,
      entityLabel: `${existing.filingType} ${existing.filingYear}`,
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/org/filings error:', error);
    return errorResponse('Failed to delete filing', 500, error);
  }
}
