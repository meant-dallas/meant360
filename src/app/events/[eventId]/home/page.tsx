'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { parsePricingRules } from '@/lib/pricing';
import { getEventTheme, getWatermarkType } from '@/lib/event-theme';
import type { SocialLinks } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCheckCircle,
  HiOutlineCalendarDays,
  HiOutlineQrCode,
  HiOutlineChevronRight,
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
  categoryBgColor: string;
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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

/* ──────────────────────────────────────────────────────────
   Context-aware watermark SVGs — large, sparse, decorative
   ────────────────────────────────────────────────────────── */
function WatermarkTech() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* Circuit board — large sparse elements */}
      <circle cx="15%" cy="20%" r="60" fill="none" stroke="white" strokeWidth="0.8" />
      <circle cx="15%" cy="20%" r="4" fill="white" />
      <line x1="15%" y1="20%" x2="45%" y2="20%" stroke="white" strokeWidth="0.6" />
      <circle cx="45%" cy="20%" r="3" fill="white" />
      <line x1="45%" y1="20%" x2="45%" y2="45%" stroke="white" strokeWidth="0.6" />
      <circle cx="45%" cy="45%" r="40" fill="none" stroke="white" strokeWidth="0.6" />
      <line x1="45%" y1="45%" x2="80%" y2="45%" stroke="white" strokeWidth="0.6" />
      <circle cx="80%" cy="45%" r="5" fill="white" />
      <line x1="80%" y1="45%" x2="80%" y2="75%" stroke="white" strokeWidth="0.6" />
      <rect x="72%" y="72%" width="60" height="60" rx="8" fill="none" stroke="white" strokeWidth="0.6" />
      <line x1="20%" y1="70%" x2="50%" y2="70%" stroke="white" strokeWidth="0.5" />
      <circle cx="20%" cy="70%" r="30" fill="none" stroke="white" strokeWidth="0.5" />
      <line x1="50%" y1="70%" x2="50%" y2="90%" stroke="white" strokeWidth="0.5" />
      <circle cx="50%" cy="90%" r="3" fill="white" />
      {/* Chip shape */}
      <rect x="60%" y="8%" width="80" height="50" rx="6" fill="none" stroke="white" strokeWidth="0.7" />
      <line x1="60%" y1="14%" x2="56%" y2="14%" stroke="white" strokeWidth="0.5" />
      <line x1="60%" y1="18%" x2="56%" y2="18%" stroke="white" strokeWidth="0.5" />
    </svg>
  );
}

function WatermarkCommunity() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* People silhouettes — abstract circles and arcs */}
      <circle cx="20%" cy="30%" r="20" fill="white" />
      <ellipse cx="20%" cy="55%" rx="30" ry="20" fill="white" />
      <circle cx="40%" cy="25%" r="16" fill="white" />
      <ellipse cx="40%" cy="47%" rx="25" ry="16" fill="white" />
      <circle cx="32%" cy="28%" r="18" fill="white" />
      <ellipse cx="32%" cy="51%" rx="28" ry="18" fill="white" />
      {/* Heart shape */}
      <path d="M 75 65 C 75 55, 85 50, 85 60 C 85 50, 95 55, 95 65 C 95 78, 85 88, 85 88 C 85 88, 75 78, 75 65" transform="translate(200, 500) scale(1.5)" fill="white" />
      {/* Hands holding — abstract */}
      <circle cx="70%" cy="25%" r="50" fill="none" stroke="white" strokeWidth="0.8" />
      <circle cx="70%" cy="25%" r="30" fill="none" stroke="white" strokeWidth="0.5" />
      <circle cx="70%" cy="25%" r="10" fill="white" />
    </svg>
  );
}

function WatermarkArts() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* Palette shape */}
      <ellipse cx="25%" cy="35%" rx="80" ry="60" fill="none" stroke="white" strokeWidth="0.8" />
      <circle cx="18%" cy="28%" r="10" fill="white" />
      <circle cx="30%" cy="22%" r="8" fill="white" />
      <circle cx="35%" cy="35%" r="9" fill="white" />
      <circle cx="18%" cy="42%" r="7" fill="white" />
      {/* Musical note */}
      <ellipse cx="75%" cy="70%" rx="12" ry="9" fill="white" transform="rotate(-20, 75%, 70%)" />
      <line x1="78%" y1="70%" x2="78%" y2="50%" stroke="white" strokeWidth="2" />
      <path d="M 0 0 C 15 -5, 25 5, 30 -2" fill="none" stroke="white" strokeWidth="2" transform="translate(330, 370) scale(0.5)" />
      {/* Star */}
      <polygon points="370,120 380,150 412,150 386,170 396,200 370,182 344,200 354,170 328,150 360,150" fill="white" />
      {/* Brush stroke */}
      <path d="M 60 700 Q 120 650, 200 700 Q 280 750, 340 690" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function WatermarkAcademic() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* Graduation cap */}
      <polygon points="100,180 180,150 260,180 180,210" fill="white" />
      <line x1="180" y1="210" x2="180" y2="250" stroke="white" strokeWidth="2" />
      <rect x="145" y="210" width="70" height="30" rx="4" fill="none" stroke="white" strokeWidth="1" />
      {/* Book */}
      <path d="M 300 500 L 300 420 Q 340 400, 380 420 L 380 500 Q 340 480, 300 500" fill="none" stroke="white" strokeWidth="1.2" />
      <path d="M 380 500 L 380 420 Q 420 400, 460 420 L 460 500 Q 420 480, 380 500" fill="none" stroke="white" strokeWidth="1.2" />
      <line x1="380" y1="420" x2="380" y2="500" stroke="white" strokeWidth="1" />
      {/* Atom */}
      <circle cx="75%" cy="30%" r="5" fill="white" />
      <ellipse cx="75%" cy="30%" rx="50" ry="20" fill="none" stroke="white" strokeWidth="0.7" />
      <ellipse cx="75%" cy="30%" rx="50" ry="20" fill="none" stroke="white" strokeWidth="0.7" transform="rotate(60, 75%, 30%)" />
      <ellipse cx="75%" cy="30%" rx="50" ry="20" fill="none" stroke="white" strokeWidth="0.7" transform="rotate(-60, 75%, 30%)" />
      {/* Lightbulb */}
      <circle cx="30%" cy="75%" r="30" fill="none" stroke="white" strokeWidth="1" />
      <rect x="27.5%" y="79%" width="20" height="10" rx="3" fill="none" stroke="white" strokeWidth="0.8" />
    </svg>
  );
}

function WatermarkCorporate() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* Abstract geometric — network nodes */}
      <polygon points="200,80 280,140 260,230 140,230 120,140" fill="none" stroke="white" strokeWidth="0.8" />
      <circle cx="200" cy="80" r="5" fill="white" />
      <circle cx="280" cy="140" r="5" fill="white" />
      <circle cx="260" cy="230" r="5" fill="white" />
      <circle cx="140" cy="230" r="5" fill="white" />
      <circle cx="120" cy="140" r="5" fill="white" />
      {/* Bar chart */}
      <rect x="65%" y="55%" width="16" height="80" rx="3" fill="white" />
      <rect x="69%" y="45%" width="16" height="90" rx="3" fill="white" />
      <rect x="73%" y="60%" width="16" height="75" rx="3" fill="white" />
      <rect x="77%" y="35%" width="16" height="100" rx="3" fill="white" />
      {/* Trend line */}
      <polyline points="80,550 160,520 240,540 320,480 400,500" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="550" r="4" fill="white" />
      <circle cx="320" cy="480" r="4" fill="white" />
      {/* Diamond / abstract logo */}
      <rect x="70%" y="15%" width="40" height="40" rx="4" fill="none" stroke="white" strokeWidth="1" transform="rotate(45, 73%, 19%)" />
    </svg>
  );
}

function WatermarkDefault() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      {/* Soft abstract geometric shapes */}
      <circle cx="18%" cy="25%" r="70" fill="none" stroke="white" strokeWidth="0.7" />
      <circle cx="18%" cy="25%" r="40" fill="none" stroke="white" strokeWidth="0.5" />
      <rect x="65%" y="15%" width="100" height="100" rx="16" fill="none" stroke="white" strokeWidth="0.6" transform="rotate(15, 70%, 20%)" />
      <circle cx="75%" cy="65%" r="50" fill="none" stroke="white" strokeWidth="0.6" />
      <circle cx="30%" cy="80%" r="35" fill="none" stroke="white" strokeWidth="0.5" />
      <line x1="30%" y1="80%" x2="75%" y2="65%" stroke="white" strokeWidth="0.4" />
    </svg>
  );
}

function CategoryWatermark({ category }: { category: string }) {
  const type = getWatermarkType(category);
  switch (type) {
    case 'tech': return <WatermarkTech />;
    case 'community': return <WatermarkCommunity />;
    case 'arts': return <WatermarkArts />;
    case 'academic': return <WatermarkAcademic />;
    case 'corporate': return <WatermarkCorporate />;
    default: return <WatermarkDefault />;
  }
}

/* ──────────────────────────────────────────────────────── */

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
      } catch { /* optional */ }
    })();
  }, []);

  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date();
    return dateStr === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return dateStr; }
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return dateStr; }
  };

  const checkinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/events/${eventId}/checkin`
    : '';

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          className="w-10 h-10 border-[3px] border-gray-200 border-t-gray-600 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  // ── Error ──
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm border border-gray-100"
        >
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-xl text-red-500">!</span>
          </div>
          <p className="text-gray-900 font-semibold">{error || 'Event not found'}</p>
        </motion.div>
      </div>
    );
  }

  const rules = parsePricingRules(event.pricingRules);
  const hasPricing = rules.enabled;
  const hasUpcoming = event.upcomingEvents && event.upcomingEvents.length > 0;
  const activeSocial = socialLinks ? SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key]) : [];
  const eventIsToday = isToday(event.date);
  const theme = getEventTheme(event.categoryBgColor);

  const checkedIn = event.memberCheckinAttendees + event.guestCheckinAttendees;
  const registered = event.memberRegAttendees + event.guestRegAttendees;
  const totalAttendees = checkedIn + registered;
  const totalGuests = event.guestCheckinAttendees + event.guestRegAttendees;
  const pct = totalAttendees > 0 ? Math.round((checkedIn / totalAttendees) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 relative">

      {/* ═══════════════ HERO HEADER ═══════════════ */}
      <div className={`relative bg-gradient-to-br ${theme.gradient} overflow-hidden`}>
        {/* Context-aware watermark */}
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none">
          <CategoryWatermark category={event.category} />
        </div>
        {/* Decorative blobs */}
        <div className={`absolute top-0 left-0 w-64 h-64 ${theme.blobA} rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3`} />
        <div className={`absolute bottom-0 right-0 w-72 h-72 ${theme.blobB} rounded-full blur-3xl translate-x-1/4 translate-y-1/4`} />

        <div className="relative z-10 mx-auto max-w-lg px-5 pt-6 pb-10">
          <motion.div variants={containerVariants} initial="hidden" animate="visible">

            {/* Parent breadcrumb */}
            {event.parentEventId && event.parentEventName && (
              <motion.div variants={itemVariants} className="mb-3">
                <button
                  onClick={() => router.push(`/events/${event.parentEventId}/home`)}
                  className="text-xs text-white/60 hover:text-white/90 transition-colors"
                >
                  &larr; {event.parentEventName}
                </button>
              </motion.div>
            )}

            {/* Logo + Title */}
            <motion.div variants={itemVariants} className="flex items-start gap-4 mb-4">
              <img
                src={event.categoryLogoUrl || '/logo.png'}
                alt={event.name}
                className="w-16 h-16 rounded-2xl border border-white/20 shadow-lg object-cover flex-shrink-0"
              />
              <div className="min-w-0 pt-0.5">
                {/* Status chip */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-1.5 bg-white/15 text-white/90 border border-white/10">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    eventIsToday ? 'bg-emerald-400 animate-pulse' :
                    event.status === 'Upcoming' ? 'bg-sky-400' :
                    event.status === 'Completed' ? 'bg-gray-400' : 'bg-red-400'
                  }`} />
                  {eventIsToday ? 'Live Today' : event.status}
                </div>
                <h1 className="text-2xl font-bold text-white leading-tight tracking-tight">
                  {event.name}
                </h1>
              </div>
            </motion.div>

            {/* Date + Description */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                <HiOutlineCalendarDays className="w-4 h-4 flex-shrink-0" />
                <span>{eventIsToday ? 'Today' : formatDate(event.date)}</span>
              </div>
              {event.description && (
                <p className="text-white/50 text-sm leading-relaxed mt-1">{event.description}</p>
              )}
            </motion.div>

            {/* Org name */}
            <motion.p variants={itemVariants} className="text-[10px] text-white/30 uppercase tracking-widest font-medium mt-4">
              Malayalee Engineers&apos; Association of North Texas
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="relative z-10 mx-auto max-w-lg px-5 -mt-4">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">

          {/* ── ACTION CARDS ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
            {/* Manual Check-In */}
            <motion.button
              onClick={() => router.push(`/events/${eventId}/checkin`)}
              className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow active:scale-[0.98]`}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
                <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">Check In</p>
              <p className="text-xs text-gray-400 mt-1 leading-snug">Look up by email</p>
            </motion.button>

            {/* QR Code */}
            <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col items-center text-center`}>
              <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center mb-2">
                <HiOutlineQrCode className="w-5 h-5 text-sky-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">Scan QR</p>
              <p className="text-xs text-gray-400 mt-1 mb-3 leading-snug">Fastest check-in</p>
              <div className={`bg-gray-50 p-2 rounded-xl`}>
                {checkinUrl && <QRCode value={checkinUrl} size={100} level="H" />}
              </div>
            </div>
          </motion.div>

          {/* ── CHECK-IN PROGRESS ── */}
          <motion.div variants={itemVariants} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-in Progress</p>
              <p className="text-xs font-bold text-gray-900">{pct}%</p>
            </div>
            <div className={`w-full h-2 bg-gray-50 rounded-full overflow-hidden mb-4`}>
              <motion.div
                className={`h-full bg-gradient-to-r ${theme.gradient} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{checkedIn}</p>
                <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">Checked In</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{totalAttendees}</p>
                <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">Total</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{totalGuests}</p>
                <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">Guests</p>
              </div>
            </div>
          </motion.div>

          {/* ── PRICING ── */}
          {hasPricing && (
            <motion.div variants={itemVariants} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <div className={`bg-gray-50 rounded-xl px-3 py-3 text-center`}>
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Member</p>
                  <p className="text-lg font-bold text-gray-900">
                    ${rules.memberPricingModel === 'family' ? rules.memberFamilyPrice : rules.memberAdultPrice}
                  </p>
                  <p className="text-[10px] text-gray-400">{rules.memberPricingModel === 'family' ? 'per family' : 'per adult'}</p>
                </div>
                <div className={`bg-gray-50 rounded-xl px-3 py-3 text-center`}>
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Guest</p>
                  <p className="text-lg font-bold text-gray-900">${rules.guestAdultPrice}</p>
                  <p className="text-[10px] text-gray-400">per adult</p>
                </div>
              </div>
              {rules.guestKidPrice > 0 && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  Guest kids: ${rules.guestKidPrice} each
                  {rules.guestKidFreeUnderAge > 0 && ` (${rules.guestKidFreeUnderAge} and under free)`}
                </p>
              )}
            </motion.div>
          )}

          {/* ── SUB-EVENTS / ACTIVITIES ── */}
          <AnimatePresence>
            {event.subEvents && event.subEvents.length > 0 && (
              <motion.div variants={itemVariants} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Activities</p>
                <div className="space-y-1.5">
                  {event.subEvents.map((sub) => {
                    const subRules = parsePricingRules(sub.pricingRules);
                    const subPrice = subRules.enabled
                      ? `$${subRules.memberPricingModel === 'family' ? subRules.memberFamilyPrice : subRules.memberAdultPrice}`
                      : 'Free';
                    return (
                      <button
                        key={sub.id}
                        onClick={() => router.push(`/events/${sub.id}/home`)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:opacity-80 transition-colors text-left group`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{sub.name}</p>
                          <p className="text-xs text-gray-400">{formatDateShort(sub.date)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-500">{subPrice}</span>
                          <HiOutlineChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── UPCOMING EVENTS ── */}
          {hasUpcoming && (
            <motion.div variants={itemVariants} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Upcoming Events</p>
              <div className="space-y-1.5">
                {event.upcomingEvents.map((ue) => (
                  <div key={ue.id} className={`flex items-center gap-3 p-2.5 rounded-xl bg-gray-50`}>
                    <img
                      src={ue.categoryLogoUrl || '/logo.png'}
                      alt={ue.name}
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ue.name}</p>
                      <p className="text-xs text-gray-400">{formatDateShort(ue.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── SOCIAL LINKS ── */}
          {activeSocial.length > 0 && (
            <motion.div variants={itemVariants} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100`}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center mb-3">Follow Us</p>
              <div className={`grid gap-2 ${
                activeSocial.length <= 2 ? 'grid-cols-2' :
                activeSocial.length === 4 ? 'grid-cols-2' :
                'grid-cols-3'
              }`}>
                {activeSocial.map((platform) => {
                  const Icon = platform.icon;
                  const url = socialLinks![platform.key];
                  return (
                    <a key={platform.key} href={url} target="_blank" rel="noopener noreferrer" className={`bg-gray-50 rounded-xl p-2.5 flex flex-col items-center gap-1.5 hover:opacity-80 transition-colors`}>
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <QRCode value={url} size={56} level="M" />
                      <p className="text-[10px] text-gray-500 font-medium">{platform.label}</p>
                    </a>
                  );
                })}
              </div>
            </motion.div>
          )}

        </motion.div>

        {/* ── FOOTER ── */}
        <div className="text-center py-6 mt-2">
          <p className="text-[10px] text-gray-300 font-medium mb-0.5">Powered by MEANT Digital Team</p>
          <p className="text-[10px] text-gray-300">
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  );
}
