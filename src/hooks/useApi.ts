'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as Sentry from '@sentry/nextjs';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  successMessage?: string;
}

export function useApi<T = unknown>(options?: UseApiOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (url: string, init?: RequestInit): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(url, init);
        const json = await response.json();

        if (!response.ok || !json.success) {
          const msg = json.error || 'Request failed';
          setError(msg);
          toast.error(msg);
          if (response.status >= 500) {
            Sentry.captureMessage(msg, { level: 'error', extra: { url, status: response.status } });
          }
          return null;
        }

        setData(json.data);
        if (options?.successMessage) {
          toast.success(options.successMessage);
        }
        options?.onSuccess?.(json.data);
        return json.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        setError(msg);
        toast.error(msg);
        Sentry.captureException(err, { extra: { url } });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options],
  );

  return { data, loading, error, execute };
}

// Hook for fetching data on mount
export function useFetch<T = unknown>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to fetch');
        if (response.status >= 500) {
          Sentry.captureMessage(json.error || 'Failed to fetch', { level: 'error', extra: { url, status: response.status } });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      Sentry.captureException(err, { extra: { url } });
    } finally {
      setLoading(false);
    }
  }, [url]);

  return { data, loading, error, refetch: fetchData };
}
