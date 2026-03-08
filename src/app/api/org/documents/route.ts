import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { orgDocumentCreateSchema, orgDocumentUpdateSchema } from '@/types/schemas';
import { orgDocumentRepository, orgDocumentVersionRepository } from '@/repositories';
import { deleteFile } from '@/lib/blob-storage';
import { logActivity } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const documentId = searchParams.get('documentId');

    // If documentId is provided, return version history
    if (documentId) {
      const versions = await orgDocumentVersionRepository.findByDocumentId(documentId);
      return jsonResponse(versions);
    }

    const filters: Record<string, string | null | undefined> = {};
    if (category) filters.category = category;
    if (status) filters.status = status;

    const docs = await orgDocumentRepository.findAll(
      Object.keys(filters).length > 0 ? filters : undefined,
    );
    return jsonResponse(docs);
  } catch (error) {
    console.error('GET /api/org/documents error:', error);
    return errorResponse('Failed to fetch documents', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(orgDocumentCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await orgDocumentRepository.create({
      ...validated,
      uploadedBy: auth.email,
    });

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'OrgDocument',
      entityId: record.id,
      entityLabel: String(validated.name),
      description: `Created document: ${validated.name}`,
    });

    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/org/documents error:', error);
    return errorResponse('Failed to create document', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(orgDocumentUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await orgDocumentRepository.findById(validated.id);
    if (!existing) return errorResponse('Document not found', 404);

    const { id, ...updateData } = validated;
    const updated = await orgDocumentRepository.update(id, updateData as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgDocument',
      entityId: id,
      entityLabel: updated.name || existing.name,
      description: `Updated document: ${updated.name || existing.name}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/org/documents error:', error);
    return errorResponse('Failed to update document', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    const existing = await orgDocumentRepository.findById(id);
    if (!existing) return errorResponse('Document not found', 404);

    // Delete all version files from blob storage
    const versions = await orgDocumentVersionRepository.findByDocumentId(id);
    for (const v of versions) {
      if (v.fileId) await deleteFile(v.fileId);
    }

    await orgDocumentRepository.delete(id);

    logActivity({
      userEmail: auth.email,
      action: 'delete',
      entityType: 'OrgDocument',
      entityId: id,
      entityLabel: existing.name,
      description: `Deleted document: ${existing.name}`,
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/org/documents error:', error);
    return errorResponse('Failed to delete document', 500, error);
  }
}
