'use client';

import { useRouter } from 'next/navigation';
import { todayCST } from '@/lib/utils';
import { HiOutlineHome, HiOutlineClipboardDocumentList, HiOutlineCheckCircle } from 'react-icons/hi2';

interface EventBottomNavProps {
  eventId: string;
  active: 'home' | 'register' | 'checkin';
  maxWidth?: string;
  // Check-in only makes sense day-of — showing it as a live tab on every
  // page load beforehand (or after) invites confused walk-ins looking for
  // an event that isn't happening yet/anymore. Pass the event's date
  // (YYYY-MM-DD) to gray it out until then; omit to always allow it (e.g.
  // multi-day events where a single "day" check isn't meaningful).
  eventDate?: string;
  // Admin-configurable via ItemsTerminology (registerCta/checkinCta) —
  // omit both for legacy (non-items) events, which keep the original
  // hardcoded labels. checkinCta === '' (explicitly, not omitted) drops
  // the Check-in tab entirely — not every event type has a check-in step.
  registerLabel?: string;
  checkinLabel?: string;
}

// Persistent tab bar shared by Event Home, Register, and Check-in so moving
// between the three feels like one app instead of three separate pages —
// same accent color as every other CTA, always in the same place.
export default function EventBottomNav({
  eventId, active, maxWidth = 'max-w-lg', eventDate, registerLabel = 'Register', checkinLabel = 'Check In',
}: EventBottomNavProps) {
  const router = useRouter();
  const checkinAllowed = !eventDate || eventDate === todayCST();
  const showCheckinTab = checkinLabel !== '';

  const tabs = [
    { key: 'home' as const, label: 'Home', icon: HiOutlineHome, path: '' },
    { key: 'register' as const, label: registerLabel, icon: HiOutlineClipboardDocumentList, path: '/register' },
    ...(showCheckinTab ? [{ key: 'checkin' as const, label: checkinLabel, icon: HiOutlineCheckCircle, path: '/checkin' }] : []),
  ];

  return (
    // max-width + mx-auto on the fixed element itself (not just an inner
    // wrapper) so the bar stays capped to the content column and centered
    // on wide screens instead of stretching edge-to-edge.
    <div className={`fixed bottom-0 left-0 right-0 ${maxWidth} mx-auto bg-white border-t border-x border-slate-200 z-30`}>
      <div className={`grid ${showCheckinTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const Icon = tab.icon;
          const disabled = tab.key === 'checkin' && !checkinAllowed;
          return (
            <button
              key={tab.key}
              disabled={disabled}
              title={disabled ? 'Check-in opens on the day of the event' : undefined}
              onClick={() => { if (!disabled) router.push(`/events/${eventId}${tab.path === '' ? '/home' : tab.path}`); }}
              className="flex flex-col items-center gap-1 py-2.5 disabled:cursor-not-allowed"
              style={{ color: disabled ? '#cbd5e1' : isActive ? 'var(--btn-color)' : '#94a3b8' }}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
