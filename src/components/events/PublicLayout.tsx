'use client';

interface PublicLayoutProps {
  eventName?: string;
  children: React.ReactNode;
}

export default function PublicLayout({ eventName, children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Compact header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.png" alt="MEANT 360" className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {eventName || 'Event'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {children}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-lg mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  );
}
