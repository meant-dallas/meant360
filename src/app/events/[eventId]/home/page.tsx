'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { parsePricingRules } from '@/lib/pricing';
import type { SocialLinks } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCheckCircle,
  HiOutlineUserGroup,
  HiOutlineCalendarDays,
  HiOutlineQrCode,
  HiOutlineClipboardDocumentCheck,
} from 'react-icons/hi2';
import { FaInstagram, FaFacebook, FaLinkedin, FaYoutube } from 'react-icons/fa6';

interface SubEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  pricingRules: string;
}

interface UpcomingEvent {
  id: string;
  name: string;
  date: string;
}

interface EventData {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  parentEventId: string;
  parentEventName: string;
  pricingRules: string;
  totalRegistrations: number;
  totalCheckins: number;
  memberCheckinAttendees: number;
  guestCheckinAttendees: number;
  memberRegAttendees: number;
  guestRegAttendees: number;
  subEvents: SubEvent[];
  siblingEvents: SubEvent[];
  upcomingEvents: UpcomingEvent[];
}

const SOCIAL_PLATFORMS: { key: keyof SocialLinks; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: FaInstagram, color: 'from-pink-500 to-purple-600' },
  { key: 'facebook', label: 'Facebook', icon: FaFacebook, color: 'from-blue-600 to-blue-700' },
  { key: 'linkedin', label: 'LinkedIn', icon: FaLinkedin, color: 'from-blue-500 to-blue-600' },
  { key: 'youtube', label: 'YouTube', icon: FaYoutube, color: 'from-red-500 to-red-600' },
];

// Staggered fade-up variants for section animations
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function EventHomePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(null);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      const json = await res.json();
      if (json.success) {
        setEvent(json.data);
      } else {
        setError('Event not found.');
      }
    } catch {
      setError('Failed to load event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
    const interval = setInterval(fetchEvent, 30000);
    return () => clearInterval(interval);
  }, [fetchEvent]);

  // Fetch social links
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/public');
        const json = await res.json();
        if (json.success && json.data?.socialLinks) {
          const links = json.data.socialLinks as SocialLinks;
          const hasAny = Object.values(links).some((v) => v);
          if (hasAny) setSocialLinks(links);
        }
      } catch {
        // Social links are optional
      }
    })();
  }, []);

  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return dateStr === `${yyyy}-${mm}-${dd}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const checkinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/events/${eventId}/checkin`
    : '';

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 flex items-center justify-center">
        <motion.div
          className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">!</span>
          </div>
          <p className="text-red-600 font-semibold text-lg">{error || 'Event not found'}</p>
        </motion.div>
      </div>
    );
  }

  const rules = parsePricingRules(event.pricingRules);
  const hasPricing = rules.enabled;
  const hasUpcomingEvents = event.upcomingEvents && event.upcomingEvents.length > 0;
  const hasSidebar = hasUpcomingEvents || !!socialLinks;
  const activeSocialPlatforms = socialLinks
    ? SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key])
    : [];
  const eventIsToday = isToday(event.date);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-pink-400/20 rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-fuchsia-300/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className={`relative z-10 mx-auto px-4 py-4 md:py-6 min-h-screen ${
        hasSidebar
          ? 'max-w-6xl lg:grid lg:grid-cols-[minmax(0,36rem)_1fr] lg:gap-8'
          : 'max-w-xl'
      }`}>

        {/* ===== LEFT COLUMN (main content) ===== */}
        <motion.div
          className="flex flex-col"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >

          {/* Association name */}
          <motion.div variants={itemVariants} className="text-center mb-1">
            <p className="text-xl md:text-2xl lg:text-3xl text-white/80 font-bold uppercase tracking-widest">
              Malayali Engineering Association (MEANT)
            </p>
          </motion.div>

          {/* Parent event breadcrumb */}
          {event.parentEventId && event.parentEventName && (
            <motion.div variants={itemVariants} className="text-center mb-2">
              <button
                onClick={() => router.push(`/events/${event.parentEventId}/home`)}
                className="text-sm text-white/70 hover:text-white transition-colors"
              >
                &larr; {event.parentEventName}
              </button>
            </motion.div>
          )}

          {/* ===== HERO (compact) ===== */}
          <motion.div variants={itemVariants} className="text-center pt-2 pb-4">
            {/* Status pill */}
            <motion.div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3 bg-white/15 text-white backdrop-blur-md border border-white/20"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <span className={`w-2 h-2 rounded-full ${
                event.status === 'Upcoming' ? 'bg-emerald-400 animate-pulse' :
                event.status === 'Completed' ? 'bg-gray-300' : 'bg-red-400'
              }`} />
              {eventIsToday ? "Today's Event" : event.status}
            </motion.div>

            {/* Event name */}
            <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-white leading-tight mb-2 drop-shadow-lg">
              {event.name}
            </h1>

            {/* Date */}
            <div className="inline-flex items-center gap-2 text-white/80 text-base md:text-lg">
              <HiOutlineCalendarDays className="w-5 h-5 flex-shrink-0" />
              <span>{eventIsToday ? 'Today' : formatDate(event.date)}</span>
            </div>

            {/* Description */}
            {event.description && (
              <p className="mt-2 text-white/60 text-sm max-w-md mx-auto leading-relaxed">
                {event.description}
              </p>
            )}
          </motion.div>

          {/* ===== LIVE STATS (sectionized) ===== */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 mb-4">
            {/* Checked In section */}
            <motion.div
              className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <HiOutlineClipboardDocumentCheck className="w-5 h-5 text-emerald-300" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Checked In</h3>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Members</span>
                  <span className="text-sm font-semibold text-white">{event.memberCheckinAttendees}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Guests</span>
                  <span className="text-sm font-semibold text-white">{event.guestCheckinAttendees}</span>
                </div>
                <div className="border-t border-white/10 pt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Total</span>
                    <span className="text-lg font-bold text-emerald-300">{event.memberCheckinAttendees + event.guestCheckinAttendees}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Registered section */}
            <motion.div
              className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <HiOutlineUserGroup className="w-5 h-5 text-amber-300" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Registered</h3>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Members</span>
                  <span className="text-sm font-semibold text-white">{event.memberRegAttendees}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Guests</span>
                  <span className="text-sm font-semibold text-white">{event.guestRegAttendees}</span>
                </div>
                <div className="border-t border-white/10 pt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Total</span>
                    <span className="text-lg font-bold text-amber-300">{event.memberRegAttendees + event.guestRegAttendees}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* ===== CHECK-IN + QR CODE (combined row) ===== */}
          <motion.div variants={itemVariants} className="grid grid-cols-[1fr_auto] gap-3 mb-4">
            <motion.button
              onClick={() => router.push(`/events/${eventId}/checkin`)}
              className="group bg-white rounded-2xl p-5 shadow-2xl shadow-black/20 hover:shadow-black/30 transition-shadow duration-200"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between h-full">
                <div className="text-left">
                  <p className="text-xl md:text-2xl font-bold text-gray-900">Check In</p>
                  <p className="text-sm text-gray-500 mt-1">Tap to check in</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <HiOutlineCheckCircle className="w-7 h-7 text-white" />
                </div>
              </div>
            </motion.button>
            <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-black/10 flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5 mb-2">
                <HiOutlineQrCode className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-semibold text-gray-700">Scan</span>
              </div>
              <div className="bg-white p-1.5 rounded-lg border border-gray-100">
                {checkinUrl && <QRCode value={checkinUrl} size={120} level="H" />}
              </div>
            </div>
          </motion.div>

          {/* ===== PRICING INFO ===== */}
          {hasPricing && (
            <motion.div
              variants={itemVariants}
              className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10 mb-4"
            >
              <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Pricing</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs text-white/60 font-medium mb-0.5">Member</p>
                  <p className="text-xl font-bold text-white">
                    ${rules.memberPricingModel === 'family' ? rules.memberFamilyPrice : rules.memberAdultPrice}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {rules.memberPricingModel === 'family' ? 'per family' : 'per adult'}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs text-white/60 font-medium mb-0.5">Guest</p>
                  <p className="text-xl font-bold text-white">${rules.guestAdultPrice}</p>
                  <p className="text-[10px] text-white/40">per adult</p>
                </div>
              </div>
              {rules.guestKidPrice > 0 && (
                <p className="text-xs text-white/50 text-center mt-2">
                  Guest kids: ${rules.guestKidPrice} each
                  {rules.guestKidFreeUnderAge > 0 && ` (${rules.guestKidFreeUnderAge} and under free)`}
                </p>
              )}
            </motion.div>
          )}

          {/* ===== SUB-EVENTS ===== */}
          <AnimatePresence>
            {event.subEvents && event.subEvents.length > 0 && (
              <motion.div
                variants={itemVariants}
                className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4"
              >
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Activities</h3>
                <div className="space-y-2">
                  {event.subEvents.map((sub, i) => {
                    const subRules = parsePricingRules(sub.pricingRules);
                    const subPriceLabel = subRules.enabled
                      ? `$${subRules.memberPricingModel === 'family' ? subRules.memberFamilyPrice : subRules.memberAdultPrice}`
                      : 'Free';
                    return (
                      <motion.button
                        key={sub.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => router.push(`/events/${sub.id}/home`)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-left border border-white/5"
                      >
                        <div>
                          <p className="font-semibold text-white text-sm">{sub.name}</p>
                          <p className="text-xs text-white/50">{formatDate(sub.date)}</p>
                        </div>
                        <span className="text-sm font-bold text-white/80">{subPriceLabel}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== SOCIAL QR CODES (mobile — shown below main content) ===== */}
          {activeSocialPlatforms.length > 0 && (
            <motion.div variants={itemVariants} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4 lg:hidden">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Follow Us</h3>
              <div className="grid grid-cols-2 gap-3">
                {activeSocialPlatforms.map((platform) => {
                  const Icon = platform.icon;
                  const url = socialLinks![platform.key];
                  return (
                    <div key={platform.key} className="bg-white rounded-xl p-3 text-center">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center mx-auto mb-2`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="inline-block bg-white p-2 rounded-lg border border-gray-100">
                        <QRCode value={url} size={80} level="M" />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 font-medium">{platform.label}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ===== UPCOMING EVENTS (mobile — shown below main content) ===== */}
          {hasUpcomingEvents && (
            <motion.div variants={itemVariants} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4 lg:hidden">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Upcoming Events</h3>
              <div className="space-y-2">
                {event.upcomingEvents.map((ue) => (
                  <div
                    key={ue.id}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/10 border border-white/5"
                  >
                    <p className="font-semibold text-white text-sm">{ue.name}</p>
                    <span className="text-xs text-white/60 flex-shrink-0 ml-2">{formatDateShort(ue.date)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Spacer to push footer down */}
          <div className="flex-1" />

          {/* ===== FOOTER ===== */}
          <motion.div variants={itemVariants} className="text-center py-6">
            <p className="text-xs text-white/30">
              {event.name} &middot; {new Date().getFullYear()}
            </p>
          </motion.div>
        </motion.div>

        {/* ===== RIGHT COLUMN (sidebar — desktop only) ===== */}
        {hasSidebar && (
          <div className="hidden lg:block">
            <motion.div
              className="sticky top-8 space-y-6"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            >
              {/* Social QR Codes */}
              {activeSocialPlatforms.length > 0 && (
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Follow Us</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {activeSocialPlatforms.map((platform) => {
                      const Icon = platform.icon;
                      const url = socialLinks![platform.key];
                      return (
                        <div key={platform.key} className="bg-white rounded-xl p-3 text-center">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center mx-auto mb-2`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="inline-block bg-white p-2 rounded-lg border border-gray-100">
                            <QRCode value={url} size={100} level="M" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1 font-medium">{platform.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming Events */}
              {hasUpcomingEvents && (
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Upcoming Events</h3>
                  <div className="space-y-2">
                    {event.upcomingEvents.map((ue) => (
                      <div
                        key={ue.id}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/10 border border-white/5"
                      >
                        <div>
                          <p className="font-semibold text-white text-sm">{ue.name}</p>
                          <p className="text-xs text-white/50">{formatDateShort(ue.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
