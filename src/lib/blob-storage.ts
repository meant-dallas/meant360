import { put, del } from '@vercel/blob';
import * as Sentry from '@sentry/nextjs';

// ========================================
// Vercel Blob Storage (Receipt Uploads)
// ========================================

export interface UploadResult {
  fileId: string;
  webViewLink: string;
  fileName: string;
}

export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const blobName = `receipts/${Date.now()}_${fileName}`;

  const blob = await put(blobName, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return {
    fileId: blob.url,
    webViewLink: blob.url,
    fileName: blobName,
  };
}

export async function uploadCategoryLogo(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const blobName = `category-logos/${Date.now()}_${fileName}`;

  const blob = await put(blobName, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return {
    fileId: blob.url,
    webViewLink: blob.url,
    fileName: blobName,
  };
}

export async function uploadOrgDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const blobName = `org-documents/${Date.now()}_${fileName}`;

  const blob = await put(blobName, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return {
    fileId: blob.url,
    webViewLink: blob.url,
    fileName: blobName,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  if (!fileId) return;
  try {
    await del(fileId);
  } catch (error) {
    console.error('Failed to delete blob:', error);
    Sentry.captureException(error, { extra: { context: 'Blob delete', fileId } });
  }
}
