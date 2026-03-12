'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'react-hot-toast';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '8px',
          background: isDark ? '#1f2937' : '#ffffff',
          color: isDark ? '#f3f4f6' : '#111827',
          border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
        },
      }}
    />
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed silently
      });
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SessionProvider>
        {children}
        <ThemedToaster />
      </SessionProvider>
    </ThemeProvider>
  );
}
