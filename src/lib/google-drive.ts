import { google } from 'googleapis';
import { Readable } from 'stream';

// ========================================
// Google Drive File Upload (Receipts)
// ========================================

function getAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error(
      'Google service account credentials are missing. ' +
      'Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env.local.',
    );
  }
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

function getDrive() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

function getFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) {
    throw new Error(
      'GOOGLE_DRIVE_FOLDER_ID is not set. Add it to your .env.local file. ' +
      'Create a folder in Google Drive and use its ID from the URL.',
    );
  }
  return id;
}

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
  const drive = getDrive();

  const fileMetadata = {
    name: `${Date.now()}_${fileName}`,
    parents: [getFolderId()],
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink',
  });

  const fileId = response.data.id!;

  // Make the file viewable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Get the updated web view link
  const fileInfo = await drive.files.get({
    fileId,
    fields: 'webViewLink',
  });

  return {
    fileId,
    webViewLink: fileInfo.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    fileName: fileMetadata.name,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  if (!fileId) return;
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId });
  } catch (error) {
    console.error('Failed to delete file from Drive:', error);
  }
}
