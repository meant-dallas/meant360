'use client';

import { useState, useEffect } from 'react';
import { HiOutlineDevicePhoneMobile, HiOutlineXMark } from 'react-icons/hi2';
import { HiOutlineArrowUpOnSquare } from 'react-icons/hi2';

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem('pwa-install-dismissed')) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    setIsIOS(ios);

    // On iOS Safari, always show manual instructions
    // On other browsers, the browser handles the install prompt natively
    if (ios) {
      setShowPrompt(true);
    }
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-safe">
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex-shrink-0">
            <HiOutlineDevicePhoneMobile className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Install MEANT 360
            </h3>
            {isIOS ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tap the Share button{' '}
                <HiOutlineArrowUpOnSquare className="inline w-4 h-4 -mt-0.5" />{' '}
                then select &quot;Add to Home Screen&quot;
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Add to your home screen for quick access
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
