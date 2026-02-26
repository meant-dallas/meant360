import { NextRequest } from 'next/server';
import { uploadFile } from '@/lib/google-drive';
import { jsonResponse, errorResponse, requireAdmin } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided');
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return errorResponse('File too large. Maximum size: 10MB');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, file.type);

    return jsonResponse(result, 201);
  } catch (error) {
    console.error('POST /api/upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('GOOGLE_DRIVE_FOLDER_ID')) {
      return errorResponse('Upload not configured: Google Drive folder ID is missing', 500);
    }
    if (message.includes('credentials') || message.includes('auth') || message.includes('service_account')) {
      return errorResponse('Upload not configured: Google service account credentials are invalid', 500);
    }
    return errorResponse(`Failed to upload file: ${message}`, 500);
  }
}
