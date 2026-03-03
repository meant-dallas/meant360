'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { analytics } from '@/lib/analytics';
import {
  HiOutlineHome,
  HiOutlineUserCircle,
  HiOutlineArrowRightOnRectangle,
  HiOutlineCog6Tooth,
  HiOutlineBars3,
  HiOutlineXMark,
  HiOutlineShieldExclamation,
} from 'react-icons/hi2';

const navItems = [
  { name: 'Home', href: '/portal', icon: HiOutlineHome },
  { name: 'Profile', href: '/portal/profile', icon: HiOutlineUserCircle },
];

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  const role = (session.user as Record<string, unknown>)?.role as string | null;
  const memberId = (session.user as Record<string, unknown>)?.memberId as string | null;

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
          <button onClick={() => { analytics.logout(); signOut({ callbackUrl: '/' }); }} className="btn-primary">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!memberId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center max-w-md mx-auto p-8">
          <HiOutlineUserCircle className="w-16 h-16 text-yellow-500 dark:text-yellow-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Member Profile</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your account is not linked to a member profile. Please contact the admin.
          </p>
          {(role === 'admin' || role === 'committee') && (
            <Link href="/dashboard" className="btn-primary mr-3">
              Go to Dashboard
            </Link>
          )}
          <button onClick={() => { analytics.logout(); signOut({ callbackUrl: '/' }); }} className="btn-secondary">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const isAdminOrCommittee = role === 'admin' || role === 'committee';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sticky navbar */}
      <nav className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo + nav links */}
            <div className="flex items-center gap-6">
              <Link href="/portal" className="flex items-center gap-2">
                <img src="/logo.png" alt="MEANT" className="w-7 h-7 rounded-lg" />
                <span className="font-semibold text-gray-900 dark:text-gray-100 hidden sm:inline">
                  Member Portal
                </span>
              </Link>
              <div className="hidden sm:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-600/20 text-primary-600 dark:text-primary-400'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  );
                })}
                {isAdminOrCommittee && (
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <HiOutlineCog6Tooth className="w-4 h-4" />
                    Admin
                  </Link>
                )}
              </div>
            </div>

            {/* Right: theme + sign out (desktop) */}
            <div className="hidden sm:flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => { analytics.logout(); signOut({ callbackUrl: '/' }); }}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Sign out"
              >
                <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
            >
              {mobileMenuOpen ? <HiOutlineXMark className="w-5 h-5" /> : <HiOutlineBars3 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-primary-600/20 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
            {isAdminOrCommittee && (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400"
              >
                <HiOutlineCog6Tooth className="w-4 h-4" />
                Admin Dashboard
              </Link>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <ThemeToggle />
              <button
                onClick={() => { analytics.logout(); signOut({ callbackUrl: '/' }); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400"
              >
                <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Content with page transition */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
