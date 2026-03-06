'use client';

import { useEffect } from 'react';
import { getEventTheme } from '@/lib/event-theme';

interface PublicLayoutProps {
  eventName?: string;
  logoUrl?: string;
  bgColor?: string;
  homeUrl?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export default function PublicLayout({ eventName, logoUrl, bgColor, homeUrl, maxWidth = 'lg', children }: PublicLayoutProps) {
  const widthClass = maxWidthClasses[maxWidth];
  const logo = logoUrl || '/logo.png';
  const theme = getEventTheme(bgColor);

  // Force light mode on public pages without persisting to user preference
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark');

    // Prevent next-themes from re-adding dark class
    const observer = new MutationObserver(() => {
      if (html.classList.contains('dark')) {
        html.classList.remove('dark');
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      // Restore dark if that was the user's stored preference
      const stored = localStorage.getItem('theme');
      if (!stored || stored === 'dark') {
        html.classList.add('dark');
      }
    };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col bg-gray-50"
      style={{
        '--btn-color': theme.btnColor,
        '--btn-hover': theme.btnHover,
        '--btn-ring': theme.btnRing,
      } as React.CSSProperties}
    >
      {/* ═══ Hero Header ═══ */}
      <div className={`relative bg-gradient-to-br ${theme.gradient} overflow-hidden`}>
        {/* Decorative blobs */}
        <div className={`absolute top-0 left-0 w-64 h-64 ${theme.blobA} rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3`} />
        <div className={`absolute bottom-0 right-0 w-72 h-72 ${theme.blobB} rounded-full blur-3xl translate-x-1/4 translate-y-1/4`} />

        <div className={`relative z-10 ${widthClass} mx-auto px-5 pt-6 pb-8`}>
          {/* Back link */}
          {homeUrl && (
            <a href={homeUrl} className="inline-flex items-center text-xs text-white/60 hover:text-white/90 transition-colors mb-3">
              &larr; Back to event
            </a>
          )}

          {/* Logo + Title */}
          <div className="flex items-center gap-4">
            <img
              src={logo}
              alt={eventName || 'Event'}
              className="w-14 h-14 rounded-2xl border border-white/20 shadow-lg object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight tracking-tight truncate">
                {eventName || 'Event'}
              </h1>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium mt-1">
                MEANT
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className={`${widthClass} mx-auto px-4 py-6 flex-1 flex flex-col justify-center w-full -mt-3`}>
        {children}
      </div>

      {/* ═══ Footer ═══ */}
      <div className="border-t border-gray-200">
        <div className={`${widthClass} mx-auto px-4 py-4 text-center`}>
          <p className="text-xs text-gray-400">
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  );
}
