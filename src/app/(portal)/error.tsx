'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-gray-500 mb-4">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
