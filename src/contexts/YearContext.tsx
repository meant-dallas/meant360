'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface YearContextValue {
  year: number;
  setYear: (y: number) => void;
  loading: boolean;
}

const YearContext = createContext<YearContextValue | undefined>(undefined);

export function YearProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success && json.data?.selected_year) {
          const parsed = parseInt(json.data.selected_year, 10);
          if (!isNaN(parsed)) setYearState(parsed);
        }
      } catch {
        // Settings may not exist yet — keep default
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setYear = useCallback((y: number) => {
    setYearState(y);
    // Persist in background
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { selected_year: String(y) } }),
    }).catch(() => {
      // Silently ignore — the UI is already updated
    });
  }, []);

  return (
    <YearContext.Provider value={{ year, setYear, loading }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used within a YearProvider');
  return ctx;
}
