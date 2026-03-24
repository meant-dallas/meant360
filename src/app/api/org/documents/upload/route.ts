import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAdmin } from '@/lib/api-helpers';
import { uploadOrgDocument } from '@/lib/blob-storage';
import { orgDocumentRepository, orgDocumentVersionRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentId = formData.get('documentId') as string | null;
    const notes = (formData.get('notes') as string) || '';

    if (!file) return errorResponse('No file provided');
    if (!documentId) return errorResponse('Document ID is required');

    const doc = await orgDocumentRepository.findById(documentId);
    if (!doc) return errorResponse('Document not found', 404);

    // Upload file to blob storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadOrgDocument(buffer, file.name, file.type);

    // Determine next version number
    const currentVersion = parseInt(doc.currentVersion) || 0;
    const nextVersion = currentVersion + 1;

    // Create version record
    const version = await orgDocumentVersionRepository.create({
      documentId,
      version: nextVersion,
      fileUrl: uploadResult.webViewLink,
      fileId: uploadResult.fileId,
      fileName: file.name,
      fileSize: file.size,
      uploadedBy: auth.email,
      notes,
    });

    // Update document with current file info
    await orgDocumentRepository.update(documentId, {
      currentVersion: nextVersion,
      currentFileUrl: uploadResult.webViewLink,
      currentFileId: uploadResult.fileId,
      uploadedBy: auth.email,
    });

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgDocument',
      entityId: documentId,
      entityLabel: doc.name,
      description: `Uploaded version ${nextVersion} of ${doc.name}`,
    });

    return jsonResponse(version, 201);
  } catch (error) {
    console.error('POST /api/org/documents/upload error:', error);
    Sentry.captureException(error, { extra: { context: 'Org documents upload POST' } });
    return errorResponse('Failed to upload document', 500, error);
  }
}
