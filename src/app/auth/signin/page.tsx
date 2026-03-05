'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] animate-pulse [animation-delay:1s]" />
        <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full bg-teal-500/15 blur-[100px] animate-pulse [animation-delay:2s]" />
        <div className="absolute bottom-[20%] left-[15%] w-[250px] h-[250px] rounded-full bg-orange-500/10 blur-[80px] animate-pulse [animation-delay:3s]" />
      </div>

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="MEANT 360"
            className="w-40 h-40 mx-auto mb-4 drop-shadow-[0_0_40px_rgba(59,130,246,0.3)]"
          />
          <p className="text-sm text-slate-400 tracking-wide">
            The MEANT Community Platform
          </p>
        </div>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white text-center mb-1">
            Sign in to continue
          </h2>
          <p className="text-sm text-slate-400 text-center mb-8">
            Use your registered Google account to access MEANT 360
          </p>

          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 text-center">
              {error === 'AccessDenied'
                ? 'Access denied. Your account is not authorized.'
                : 'An error occurred during sign in. Please try again.'}
            </div>
          )}

          <button
            onClick={() => signIn('google', { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-white hover:bg-gray-50 transition-all duration-200 font-medium text-gray-700 shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Become a member */}
        <div className="text-center mt-6">
          <Link
            href="/membership/apply"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Not a member? <span className="underline">Become a member</span>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-8">
          &copy; 2026 Malayalee Engineers&apos; Association of North Texas
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
