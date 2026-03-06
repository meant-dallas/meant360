import { NextRequest } from 'next/server';
import { uploadCategoryLogo, deleteFile } from '@/lib/blob-storage';
import { jsonResponse, errorResponse, requireAdmin } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const oldLogoUrl = formData.get('oldLogoUrl') as string | null;

    if (!file) {
      return errorResponse('No file provided');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG');
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return errorResponse('File too large. Maximum size: 2MB');
    }

    // Delete old logo if replacing
    if (oldLogoUrl) {
      await deleteFile(oldLogoUrl);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadCategoryLogo(buffer, file.name, file.type);

    return jsonResponse(result, 201);
  } catch (error) {
    console.error('POST /api/upload/category-logo error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('BLOB_READ_WRITE_TOKEN')) {
      return errorResponse('Upload not configured: Vercel Blob token is missing', 500, error);
    }
    return errorResponse(`Failed to upload logo: ${message}`, 500, error);
  }
}
