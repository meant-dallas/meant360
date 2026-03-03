'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';
import {
  HiOutlineCalendarDays,
  HiOutlineCheckBadge,
  HiOutlineClock,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineTicket,
} from 'react-icons/hi2';
import { analytics } from '@/lib/analytics';

interface DashboardData {
  name: string;
  spouseName: string;
  status: string;
  membershipType: string;
  membershipYears: string;
  renewalDate: string;
  registrationDate: string;
  stats: { totalEventsRegistered: number; totalEventsAttended: number };
}

interface EventHistoryItem {
  participantId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventStatus: string;
  registeredAdults: number;
  registeredKids: number;
  checkedInAt: string;
  selectedActivities: string;
  totalPrice: string;
  paymentStatus: string;
  paymentMethod: string;
  registeredAt: string;
}

interface UpcomingEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  description: string;
  registrationOpen: string;
  isRegistered: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function MemberHomePage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<EventHistoryItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    analytics.portalViewed();
    Promise.all([
      fetch('/api/portal/dashboard').then((r) => r.json()),
      fetch('/api/portal/events').then((r) => r.json()),
    ]).then(([dashRes, eventsRes]) => {
      if (dashRes.success) setDashboard(dashRes.data);
      if (eventsRes.success) {
        setHistory(eventsRes.data.history || []);
        setUpcoming(eventsRes.data.upcoming || []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Failed to load dashboard.</p>
      </div>
    );
  }

  const memberSinceYear = dashboard.registrationDate
    ? new Date(dashboard.registrationDate).getFullYear()
    : dashboard.membershipYears?.split(',')[0]?.trim() || '—';

  const isExpiredOrNotRenewed = dashboard.status === 'Expired' || dashboard.status === 'Not Renewed';

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Section 1: Membership Status Card */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <p className="text-primary-200 text-sm font-medium">Welcome back,</p>
            <h1 className="text-2xl font-bold mt-1">
              {dashboard.name}{dashboard.spouseName ? ` & ${dashboard.spouseName}` : ''}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20">
                {dashboard.membershipType}
              </span>
              <StatusBadge status={dashboard.status} />
            </div>
            {dashboard.renewalDate && (
              <p className="text-primary-200 text-sm mt-3">
                Renewal date: {formatDate(dashboard.renewalDate)}
              </p>
            )}
            {isExpiredOrNotRenewed && (
              <a
                href="https://meant.org"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => analytics.membershipRenewalClicked()}
                className="inline-block mt-4 px-4 py-2 bg-white text-primary-700 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Renew Membership
              </a>
            )}
          </div>
        </div>
      </motion.div>

      {/* Section 2: Quick Stats */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-blue-500/20 dark:bg-blue-500/10 p-4 text-center">
            <HiOutlineTicket className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {dashboard.stats.totalEventsRegistered}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Registered</p>
          </div>
          <div className="rounded-xl bg-green-500/20 dark:bg-green-500/10 p-4 text-center">
            <HiOutlineCheckBadge className="w-6 h-6 text-green-600 dark:text-green-400 mx-auto" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {dashboard.stats.totalEventsAttended}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Attended</p>
          </div>
          <div className="rounded-xl bg-purple-500/20 dark:bg-purple-500/10 p-4 text-center">
            <HiOutlineClock className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {memberSinceYear}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Member Since</p>
          </div>
        </div>
      </motion.div>

      {/* Section 3: Upcoming Events */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Upcoming Events</h2>
        {upcoming.length === 0 ? (
          <div className="card p-6 text-center">
            <HiOutlineCalendarDays className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">No upcoming events at the moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => {
              const canRegister =
                event.registrationOpen?.toLowerCase() === 'true' && !event.isRegistered;
              return (
                <div key={event.eventId} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{event.eventName}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(event.eventDate)}
                      </p>
                      {event.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {event.isRegistered ? (
                        <StatusBadge status="Registered" />
                      ) : canRegister ? (
                        <Link
                          href={`/events/${event.eventId}/register`}
                          className="inline-flex items-center px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                        >
                          Register
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Section 4: Event History */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Event History</h2>
        {history.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">No past event participations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => {
              const isExpanded = expandedEvent === item.participantId;
              let activities: { activityId: string; participantName: string }[] = [];
              try {
                if (item.selectedActivities) activities = JSON.parse(item.selectedActivities);
              } catch { /* ignore */ }
              const totalAttendees = item.registeredAdults + item.registeredKids;

              return (
                <div key={item.participantId} className="card">
                  <button
                    onClick={() => setExpandedEvent(isExpanded ? null : item.participantId)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.eventName}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {formatDate(item.eventDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={item.checkedInAt ? 'Checked In' : 'Registered'} />
                        {totalAttendees > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {totalAttendees} {totalAttendees === 1 ? 'person' : 'people'}
                          </span>
                        )}
                        {isExpanded ? (
                          <HiOutlineChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <HiOutlineChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Adults</span>
                        <span className="text-gray-900 dark:text-gray-100">{item.registeredAdults}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Kids</span>
                        <span className="text-gray-900 dark:text-gray-100">{item.registeredKids}</span>
                      </div>
                      {item.totalPrice && Number(item.totalPrice) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Amount</span>
                          <span className="text-gray-900 dark:text-gray-100">${item.totalPrice}</span>
                        </div>
                      )}
                      {item.paymentStatus && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Payment</span>
                          <span className="text-gray-900 dark:text-gray-100 capitalize">
                            {item.paymentStatus}{item.paymentMethod ? ` (${item.paymentMethod})` : ''}
                          </span>
                        </div>
                      )}
                      {activities.length > 0 && (
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 mb-1">Activities</p>
                          <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
                            {activities.map((a, i) => (
                              <li key={i}>{a.participantName} — {a.activityId}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
