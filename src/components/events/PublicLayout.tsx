'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getEventTheme } from '@/lib/event-theme';
import FeedbackButton from '@/components/ui/FeedbackButton';
import EventUserBar from '@/components/events/EventUserBar';

interface PublicLayoutProps {
  eventName?: string;
  logoUrl?: string;
  bgColor?: string;
  homeUrl?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 'gradient' (default) is the legacy full-bleed hero. 'ticket' is a
   * compact boarding-pass-style card — used by the items registration model. */
  variant?: 'gradient' | 'ticket';
  children: React.ReactNode;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export default function PublicLayout({ eventName, logoUrl, bgColor, homeUrl, maxWidth = 'lg', variant = 'gradient', children }: PublicLayoutProps) {
  const { data: session } = useSession();
  const widthClass = maxWidthClasses[maxWidth];
  const logo = logoUrl || '/logo.png';
  // Theme colors (button, step tracker, etc) come from the event's category
  // — configured in Settings → Event Categories — for both layout variants,
  // so Home/Register/Check-in all match whatever brand color the committee
  // picked for that category instead of a fixed app-wide accent.
  const theme = getEventTheme(bgColor);
  const accent = theme;

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
      className={`min-h-screen flex flex-col ${variant === 'ticket' ? 'bg-slate-100' : 'bg-gray-50'}`}
      style={{
        '--btn-color': accent.btnColor,
        '--btn-hover': accent.btnHover,
        '--btn-ring': accent.btnRing,
      } as React.CSSProperties}
    >
      {variant === 'ticket' ? (
        /* ═══ Boarding-pass header ═══ */
        <div className={`${widthClass} w-full mx-auto px-4 pt-5`}>
          {homeUrl && (
            <a href={homeUrl} className="inline-flex items-center text-xs text-slate-500 hover:text-slate-700 transition-colors mb-2 font-medium">
              &larr; Back to event
            </a>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <img
                src={logo}
                alt={eventName || 'Event'}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-100"
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest font-bold" style={{ color: accent.btnColor }}>MEANT360</p>
                <h1 className="text-base font-bold text-slate-900 leading-tight truncate">
                  {eventName || 'Event'}
                </h1>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═══ Hero Header ═══ */
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
      )}

      {/* ═══ Content ═══ */}
      {/* Ticket variant flows top-down right under the boarding-pass header —
          centering it (like the gradient variant does) would strand it in
          the middle of the viewport with a dead gap above, since the ticket
          header is short and doesn't need the same visual counterweight. */}
      <div className={variant === 'ticket'
        ? `${widthClass} mx-auto px-4 pt-3 pb-6 flex-1 w-full`
        : `${widthClass} mx-auto px-4 py-6 flex-1 flex flex-col justify-center w-full -mt-3`
      }>
        {children}
      </div>

      {/* ═══ Footer ═══ */}
      <div className={`border-t ${variant === 'ticket' ? 'border-slate-200' : 'border-gray-200'}`}>
        <div className={`${widthClass} mx-auto px-4 py-4 text-center`}>
          <p className={`text-xs ${variant === 'ticket' ? 'text-slate-400' : 'text-gray-400'}`}>
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>
      {session && <FeedbackButton />}
    </div>
  );
}
