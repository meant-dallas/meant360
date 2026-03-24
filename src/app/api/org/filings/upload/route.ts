import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAdmin } from '@/lib/api-helpers';
import { uploadOrgDocument } from '@/lib/blob-storage';
import { orgFilingRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const filingId = formData.get('filingId') as string | null;

    if (!file) return errorResponse('No file provided');
    if (!filingId) return errorResponse('Filing ID is required');

    const filing = await orgFilingRepository.findById(filingId);
    if (!filing) return errorResponse('Filing not found', 404);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadOrgDocument(buffer, file.name, file.type);

    const updated = await orgFilingRepository.update(filingId, {
      documentUrl: uploadResult.webViewLink,
      documentFileId: uploadResult.fileId,
    });

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgFiling',
      entityId: filingId,
      entityLabel: `${filing.filingType} ${filing.filingYear}`,
      description: `Uploaded document for ${filing.filingType} ${filing.filingYear}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    console.error('POST /api/org/filings/upload error:', error);
    Sentry.captureException(error, { extra: { context: 'Org filings upload POST' } });
    return errorResponse('Failed to upload filing document', 500, error);
  }
}
