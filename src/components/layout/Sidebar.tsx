'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  HiOutlineHome,
  HiOutlineCurrencyDollar,
  HiOutlineHeart,
  HiOutlineDocumentText,
  HiOutlineReceiptRefund,
  HiOutlineArrowsRightLeft,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineCalendarDays,
  HiOutlineUserGroup,
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HiOutlineHome, adminOnly: true },
  { name: 'Income', href: '/finance/income', icon: HiOutlineCurrencyDollar, adminOnly: true },
  { name: 'Sponsorships', href: '/sponsors/sponsorships', icon: HiOutlineHeart, adminOnly: true },
  { name: 'Sponsors', href: '/sponsors', icon: HiOutlineBuildingOffice2, adminOnly: true },
  { name: 'Expenses', href: '/finance/expenses', icon: HiOutlineDocumentText, adminOnly: true },
  { name: 'Reimbursements', href: '/finance/reimbursements', icon: HiOutlineReceiptRefund, adminOnly: true },
  { name: 'Transactions', href: '/finance/transactions', icon: HiOutlineArrowsRightLeft, adminOnly: true },
  { name: 'Members', href: '/members', icon: HiOutlineUserGroup, adminOnly: false },
  { name: 'Events', href: '/settings/events', icon: HiOutlineCalendarDays, adminOnly: false },
  { name: 'Reports', href: '/reports', icon: HiOutlineChartBar, adminOnly: true },
  { name: 'Settings', href: '/settings', icon: HiOutlineCog6Tooth, adminOnly: true },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;

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
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">MO</span>
            </div>
            <span className="font-semibold text-lg text-gray-900">MEANT Operations</span>
          </Link>
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-gray-600"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.filter((item) => !item.adminOnly || role === 'admin').map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 p-4">
          {session?.user && (
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 text-xs font-medium">
                    {session.user.name?.charAt(0) || 'U'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {role || 'unknown'}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-gray-400 hover:text-gray-600"
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
