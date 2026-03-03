'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
    const role = (session.user as Record<string, unknown>)?.role as string | null;
    if (role === 'admin' || role === 'committee') {
      analytics.loginSuccess(role);
      router.push('/dashboard');
    } else if (role === 'member') {
      analytics.loginSuccess(role);
      router.push('/portal');
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MEANT" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">MEANT Operations</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Operations management for MEANT
          </p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
            Sign in to continue
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            Use your Google account to access the portal.
          </p>

          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-gray-700 dark:text-gray-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Access is restricted to authorized members and committee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
