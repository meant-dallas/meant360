'use client';

import { useState, useRef } from 'react';
import { HiOutlineCloudArrowUp, HiOutlineXMark } from 'react-icons/hi2';
import toast from 'react-hot-toast';

interface FileUploadProps {
  onUploadComplete: (result: { fileId: string; webViewLink: string }) => void;
  currentUrl?: string;
}

export default function FileUpload({ onUploadComplete, currentUrl }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(currentUrl || '');
  const [configError, setConfigError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setConfigError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      if (!json.success) {
        const err: string = json.error || 'Upload failed';
        if (err.toLowerCase().includes('not configured')) {
          setConfigError(err);
        } else {
          toast.error(err);
        }
        return;
      }

      setUploadedUrl(json.data.webViewLink);
      onUploadComplete({
        fileId: json.data.fileId,
        webViewLink: json.data.webViewLink,
      });
      toast.success('File uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {uploadedUrl ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <a
            href={uploadedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-700 hover:underline truncate flex-1"
          >
            View uploaded receipt
          </a>
          <button
            type="button"
            onClick={() => {
              setUploadedUrl('');
              onUploadComplete({ fileId: '', webViewLink: '' });
            }}
            className="text-green-500 hover:text-green-700"
          >
            <HiOutlineXMark className="w-4 h-4" />
          </button>
        </div>
      ) : configError ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
          <HiOutlineCloudArrowUp className="w-6 h-6 text-gray-300 mx-auto mb-1" />
          <p className="text-sm text-gray-500">Receipt upload is not available</p>
          <p className="text-xs text-gray-400 mt-1">Google Drive has not been configured yet</p>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <HiOutlineCloudArrowUp className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-600">Click to upload receipt</p>
              <p className="text-xs text-gray-400">JPEG, PNG, PDF up to 10MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
        </div>
      )}
    </div>
  );
}
