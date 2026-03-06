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
  categoryLogoUrl: string;
}

interface EventData {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  category: string;
  categoryLogoUrl: string;
  parentEventId: string;
  parentEventName: string;
  pricingRules: string;
  formConfig: string;
  activities: string;
  activityPricingMode: string;
  guestPolicy: string;
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
  const activeSocialPlatforms = socialLinks
    ? SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key])
    : [];
  const eventIsToday = isToday(event.date);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-pink-400/20 rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />

      <div className="relative z-10 mx-auto max-w-lg px-4 py-4 flex flex-col min-h-screen">

        <motion.div
          className="flex flex-col flex-1"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >

          {/* ===== HEADER: Logo + Org Name ===== */}
          <motion.div variants={itemVariants} className="text-center pt-2 pb-1">
            <img
              src={event.categoryLogoUrl || '/logo.png'}
              alt={event.name}
              className="w-16 h-16 rounded-2xl mx-auto border-2 border-white/20 shadow-lg object-cover mb-2"
            />
            <p className="text-sm text-white/60 font-semibold uppercase tracking-wider">
              Malayalee Engineers&apos; Association of North Texas
            </p>
          </motion.div>

          {/* Parent event breadcrumb */}
          {event.parentEventId && event.parentEventName && (
            <motion.div variants={itemVariants} className="text-center mb-1">
              <button
                onClick={() => router.push(`/events/${event.parentEventId}/home`)}
                className="text-sm text-white/70 hover:text-white transition-colors active:scale-95"
              >
                &larr; {event.parentEventName}
              </button>
            </motion.div>
          )}

          {/* ===== EVENT INFO ===== */}
          <motion.div variants={itemVariants} className="text-center pb-4">
            {/* Status pill */}
            <motion.div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2 bg-white/15 text-white backdrop-blur-md border border-white/20"
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

            <h1 className="text-2xl font-extrabold text-white leading-tight mb-1.5 drop-shadow-lg">
              {event.name}
            </h1>

            <div className="inline-flex items-center gap-2 text-white/80 text-base">
              <HiOutlineCalendarDays className="w-5 h-5 flex-shrink-0" />
              <span>{eventIsToday ? 'Today' : formatDate(event.date)}</span>
            </div>

            {event.description && (
              <p className="mt-2 text-white/60 text-sm leading-relaxed">
                {event.description}
              </p>
            )}
          </motion.div>

          {/* ===== CHECK-IN OPTIONS (side by side) ===== */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 mb-4">
            {/* Manual Check-In */}
            <motion.button
              onClick={() => router.push(`/events/${eventId}/checkin`)}
              className="group bg-white rounded-2xl p-4 shadow-xl active:scale-[0.97] transition-transform duration-100 text-left"
              whileTap={{ scale: 0.97 }}
            >
              <div className="w-11 h-11 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center mb-3">
                <HiOutlineCheckCircle className="w-6 h-6 text-white" />
              </div>
              <p className="text-base font-bold text-gray-900 leading-tight">Manual Check-In</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">Check in here using email address</p>
            </motion.button>

            {/* QR Code Check-In */}
            <div className="bg-white rounded-2xl p-4 shadow-xl flex flex-col items-center text-center">
              <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center mb-2">
                <HiOutlineQrCode className="w-6 h-6 text-white" />
              </div>
              <p className="text-base font-bold text-gray-900 leading-tight">QR Code Check-In</p>
              <p className="text-sm text-gray-500 mt-1 mb-3 leading-snug">Scan here to check in from your device</p>
              <div className="bg-white p-1.5 rounded-xl border border-gray-100">
                {checkinUrl && <QRCode value={checkinUrl} size={110} level="H" />}
              </div>
            </div>
          </motion.div>

          {/* ===== LIVE STATS ===== */}
          <motion.div variants={itemVariants} className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 mb-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white/10 rounded-xl py-2.5 px-1">
                <p className="text-xl font-bold text-emerald-300">{event.memberCheckinAttendees + event.guestCheckinAttendees}</p>
                <p className="text-[10px] text-white/50 font-medium mt-0.5 uppercase">Checked In</p>
              </div>
              <div className="bg-white/10 rounded-xl py-2.5 px-1">
                <p className="text-xl font-bold text-amber-300">{event.memberRegAttendees + event.guestRegAttendees}</p>
                <p className="text-[10px] text-white/50 font-medium mt-0.5 uppercase">Registered</p>
              </div>
              <div className="bg-white/10 rounded-xl py-2.5 px-1">
                <p className="text-xl font-bold text-blue-300">{event.memberCheckinAttendees + event.memberRegAttendees}</p>
                <p className="text-[10px] text-white/50 font-medium mt-0.5 uppercase">Members</p>
              </div>
              <div className="bg-white/10 rounded-xl py-2.5 px-1">
                <p className="text-xl font-bold text-pink-300">{event.guestCheckinAttendees + event.guestRegAttendees}</p>
                <p className="text-[10px] text-white/50 font-medium mt-0.5 uppercase">Guests</p>
              </div>
            </div>
          </motion.div>

          {/* ===== PRICING INFO ===== */}
          {hasPricing && (
            <motion.div
              variants={itemVariants}
              className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/10 mb-4"
            >
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
                <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Activities</h3>
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
                        className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/25 transition-colors text-left border border-white/5"
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

          {/* ===== UPCOMING EVENTS ===== */}
          {hasUpcomingEvents && (
            <motion.div variants={itemVariants} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 mb-4">
              <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Upcoming Events</h3>
              <div className="space-y-2">
                {event.upcomingEvents.map((ue) => (
                  <div
                    key={ue.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-white/5"
                  >
                    <img
                      src={ue.categoryLogoUrl || '/logo.png'}
                      alt={ue.name}
                      className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-white/20"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{ue.name}</p>
                      <p className="text-xs text-white/50">{formatDateShort(ue.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===== SOCIAL LINKS (compact inline) ===== */}
          {activeSocialPlatforms.length > 0 && (
            <motion.div variants={itemVariants} className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10 mb-4">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mr-1">Follow Us</span>
                {activeSocialPlatforms.map((platform) => {
                  const Icon = platform.icon;
                  const url = socialLinks![platform.key];
                  return (
                    <a key={platform.key} href={url} target="_blank" rel="noopener noreferrer" className="bg-white rounded-lg p-1.5 flex flex-col items-center gap-1">
                      <div className={`w-5 h-5 rounded bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <QRCode value={url} size={44} level="M" />
                      <p className="text-[9px] text-gray-500 font-medium">{platform.label}</p>
                    </a>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Spacer to push footer down */}
          <div className="flex-1" />

          {/* ===== FOOTER ===== */}
          <motion.div variants={itemVariants} className="text-center py-4">
            <p className="text-xs text-white/30">
              &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
