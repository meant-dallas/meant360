'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useYear } from '@/contexts/YearContext';
import {
  HiOutlineHome,
  HiOutlineCurrencyDollar,
  HiOutlineHeart,
  HiOutlineDocumentText,
  HiOutlineClipboardDocumentList,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineUserGroup,
  HiOutlineXMark,
  HiOutlineUserCircle,
  HiOutlineUsers,
  HiOutlineEnvelope,
  HiOutlineClipboardDocumentCheck,
} from 'react-icons/hi2';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HiOutlineHome },
  { name: 'Income', href: '/finance/income', icon: HiOutlineCurrencyDollar },
  { name: 'Sponsors', href: '/sponsors', icon: HiOutlineHeart },
  { name: 'Expenses', href: '/finance/expenses', icon: HiOutlineDocumentText },
  { name: 'Activity Log', href: '/finance/transactions', icon: HiOutlineClipboardDocumentList },
  { name: 'Members', href: '/members', icon: HiOutlineUserGroup },
  { name: 'Applications', href: '/membership-applications', icon: HiOutlineClipboardDocumentCheck },
  { name: 'Guests', href: '/guests', icon: HiOutlineUsers },
  { name: 'Events', href: '/event-management', icon: HiOutlineCalendarDays },
  { name: 'Reports', href: '/reports', icon: HiOutlineChartBar },
  { name: 'Email', href: '/email/compose', icon: HiOutlineEnvelope },
  { name: 'Settings', href: '/settings', icon: HiOutlineCog6Tooth },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { year } = useYear();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const memberId = (session?.user as Record<string, unknown>)?.memberId as string | null;
  const [pendingAppCount, setPendingAppCount] = useState(0);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/membership-applications/list?status=Pending')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setPendingAppCount(json.data.length);
        }
      })
      .catch(() => {});
  }, [session?.user, pathname]);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <img src="/logo.png" alt="MEANT 360" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">MEANT 360</span>
          </Link>
          <button
            onClick={onClose}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Active Year */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <HiOutlineCalendarDays className="w-4 h-4" />
            <span>Active Year: <span className="font-semibold text-gray-900 dark:text-gray-100">{year}</span></span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-600/20 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.name}
                {item.name === 'Applications' && pendingAppCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingAppCount}
                  </span>
                )}
              </Link>
            );
          })}
          {memberId && (
            <Link
              href="/portal"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === '/portal' || pathname?.startsWith('/portal/')
                  ? 'bg-primary-600/20 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
              )}
            >
              <HiOutlineUserCircle className="w-5 h-5 flex-shrink-0" />
              Member Portal
            </Link>
          )}
        </nav>

        {/* User + Theme Toggle */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          {session?.user && (
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 text-xs font-medium">
                    {session.user.name?.charAt(0) || 'U'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {role || 'unknown'}
                </p>
              </div>
              <ThemeToggle />
              <button
                onClick={() => { analytics.logout(); signOut({ callbackUrl: '/' }); }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title="Sign out"
              >
                <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
