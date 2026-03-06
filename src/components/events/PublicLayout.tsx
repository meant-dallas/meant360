'use client';

interface PublicLayoutProps {
  eventName?: string;
  logoUrl?: string;
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

export default function PublicLayout({ eventName, logoUrl, homeUrl, maxWidth = 'lg', children }: PublicLayoutProps) {
  const widthClass = maxWidthClasses[maxWidth];
  const logo = logoUrl || '/logo.png';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Compact header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className={`${widthClass} mx-auto px-4 py-3 flex items-center gap-3`}>
          {homeUrl ? (
            <a href={homeUrl} className="flex items-center gap-3 min-w-0">
              <img src={logo} alt="MEANT 360" className="w-8 h-8 rounded-lg flex-shrink-0 object-cover" />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {eventName || 'Event'}
              </p>
            </a>
          ) : (
            <>
              <img src={logo} alt="MEANT 360" className="w-8 h-8 rounded-lg flex-shrink-0 object-cover" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {eventName || 'Event'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`${widthClass} mx-auto px-4 py-6 flex-1 flex flex-col justify-center w-full`}>
        {children}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        <div className={`${widthClass} mx-auto px-4 py-4 text-center`}>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  );
}
