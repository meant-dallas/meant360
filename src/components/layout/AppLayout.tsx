'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { HiOutlineBars3 } from 'react-icons/hi2';
import { HiOutlineShieldExclamation } from 'react-icons/hi2';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const role = (session.user as Record<string, unknown>)?.role;
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center max-w-md mx-auto p-8">
          <HiOutlineShieldExclamation className="w-16 h-16 text-red-500 dark:text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-1">
            Your account is not authorized to access this application.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            Signed in as {session.user?.email}
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="btn-primary"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center h-14 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 -ml-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <HiOutlineBars3 className="w-6 h-6" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">MO</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100">MEANT Operations</span>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="ml-0 md:ml-64 min-h-screen pt-14 md:pt-0">
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
