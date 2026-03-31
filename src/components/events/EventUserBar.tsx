'use client';

import type { Session } from 'next-auth';
import type { UserRole } from '@/types';

interface EventUserBarProps {
  session: Session;
  memberStatus?: string;
}

function getRoleLabel(role: string | undefined | null, memberStatus?: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'committee') return 'Committee';
  if (role === 'member') {
    if (memberStatus === 'Active') return 'Active Member';
    if (memberStatus === 'Expired' || memberStatus === 'Not Renewed') return 'Expired Member';
    return 'Member';
  }
  return 'Guest';
}

function getInitial(session: Session): string {
  const src = session.user?.name || session.user?.email || '?';
  return src[0].toUpperCase();
}

export default function EventUserBar({ session, memberStatus }: EventUserBarProps) {
  const role = (session.user as Record<string, unknown>)?.role as UserRole | undefined;
  const label = getRoleLabel(role, memberStatus);

  return (
    <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
      {session.user?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          className="w-7 h-7 rounded-full flex-shrink-0"
          alt=""
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {getInitial(session)}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-white text-xs font-medium leading-tight truncate">
          {session.user?.name || session.user?.email}
        </p>
        <p className="text-white/50 text-[10px] leading-tight">{label}</p>
      </div>
    </div>
  );
}
