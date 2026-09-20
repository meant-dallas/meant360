'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { parsePricingRules } from '@/lib/pricing';
import { parseActivityMode, getActivityLabels } from '@/lib/event-config';
import { parseLocalDate } from '@/lib/utils';
import { getEventTheme } from '@/lib/event-theme';
import type { SocialLinks, PublicSponsor, ItemsTerminology } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCalendarDays,
  HiOutlineChevronRight,
} from 'react-icons/hi2';
import { SOCIAL_PLATFORMS } from '@/lib/social-platforms';
import EventBottomNav from '@/components/events/EventBottomNav';

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
  parentEventId?: string;
  parentEventName?: string;
  pricingRules: string;
  formConfig: string;
  activities: string;
  activityPricingMode: string;
  guestPolicy: string;
  registrationOpen: string;
  capacity: number;
  capacityMode: string;
  spotsRemaining: number;
  waitlistCount: number;
  activityMaxSlots?: number;
  totalActivitySlots: number;
  selfServiceEditEnabled: boolean;
  totalRegistrations: number;
  totalCheckins: number;
  totalWalkins: number;
  memberCheckinAttendees: number;
  guestCheckinAttendees: number;
  memberRegAttendees: number;
  guestRegAttendees: number;
  totalUniqueAttendees: number;
  totalUniqueGuests: number;
  subEvents?: SubEvent[];
  siblingEvents?: SubEvent[];
  upcomingEvents: UpcomingEvent[];
  // Items-model events only (see getItemsEventHomeDetail) — legacy events
  // have no admin-configurable terminology, so this is absent for them and
  // every usage below falls back to the plain English default.
  terminology?: ItemsTerminology;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};


interface EventHomeClientProps {
  event: EventData;
  socialLinks: SocialLinks | null;
  sponsors: { eventSponsors: PublicSponsor[]; generalSponsors: PublicSponsor[] };
}

// Prominence scales with tier instead of a uniform grid: Platinum gets a
// full-width block in the brand accent, Gold gets named two-up tiles, and
// everything else (Silver/Bronze/untiered) is a compact logo-only grid.
const TIER_ORDER = ['Platinum', 'Gold', 'Silver', 'Bronze', ''] as const;
const TIER_SIZE: Record<string, 'lg' | 'md' | 'sm'> = {
  Platinum: 'lg', Gold: 'md', Silver: 'sm', Bronze: 'sm', '': 'sm',
};

function SponsorTierTile({ sponsor, size }: { sponsor: PublicSponsor; size: 'lg' | 'md' | 'sm' }) {
  const Wrapper = sponsor.website ? 'a' : 'div';
  const wrapperProps = sponsor.website
    ? { href: sponsor.website, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  if (size === 'lg') {
    return (
      <Wrapper {...wrapperProps} className="flex items-center gap-3 p-4 rounded-xl no-underline" style={{ backgroundColor: 'var(--btn-color)' }}>
        <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {sponsor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sponsor.logoUrl} alt={sponsor.name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-white font-bold text-sm">{sponsor.name.charAt(0)}</span>
          )}
        </div>
        <p className="text-sm font-bold text-white truncate">{sponsor.name}</p>
      </Wrapper>
    );
  }

  if (size === 'md') {
    return (
      <Wrapper {...wrapperProps} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white no-underline min-w-0">
        {sponsor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsor.logoUrl} alt="" className="w-6 h-6 rounded object-contain flex-shrink-0" />
        ) : null}
        <p className="text-xs font-bold text-slate-900 truncate">{sponsor.name}</p>
      </Wrapper>
    );
  }

  return (
    <Wrapper {...wrapperProps} className="aspect-[16/9] rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden no-underline">
      {sponsor.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sponsor.logoUrl} alt={sponsor.name} className="w-full h-full object-contain p-1.5" />
      ) : (
        <span className="text-[10px] font-semibold text-slate-400">{sponsor.name.charAt(0)}</span>
      )}
    </Wrapper>
  );
}

// Sponsors are already tier+amount sorted server-side; group by tier here
// purely for layout (each tier gets its own size/grid), not re-sorting.
function SponsorGroupList({ sponsors }: { sponsors: PublicSponsor[] }) {
  return (
    <div className="space-y-3">
      {TIER_ORDER.map((tier) => {
        const group = sponsors.filter((s) => (s.tier || '') === tier);
        if (group.length === 0) return null;
        const size = TIER_SIZE[tier];
        return (
          <div key={tier || 'untiered'}>
            {tier && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">{tier}</p>}
            <div className={size === 'lg' ? 'space-y-2' : size === 'md' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-4 gap-2'}>
              {group.map((s) => <SponsorTierTile key={s.id} sponsor={s} size={size} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EventHomeClient({ event, socialLinks, sponsors }: EventHomeClientProps) {
  const router = useRouter();
  const eventId = event.id;
  const [descExpanded, setDescExpanded] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return parseLocalDate(dateStr).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
      });
    } catch { return dateStr; }
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return parseLocalDate(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'America/Chicago',
      });
    } catch { return dateStr; }
  };

  const rules = parsePricingRules(event.pricingRules);
  const hasPricing = rules.enabled;
  const hasUpcoming = event.upcomingEvents && event.upcomingEvents.length > 0;
  const activeSocial = socialLinks ? SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key]) : [];
  const eventIsToday = event.date ? (() => {
    const d = new Date();
    return event.date === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })() : false;

  const registrationOpen = event.registrationOpen?.toLowerCase() === 'true';
  // spotsRemaining: -1 = unlimited, 0 = full, >0 = available
  const hasSpots = event.spotsRemaining === -1 || event.spotsRemaining > 0;
  const showRegister = registrationOpen;
  // Legacy events (no terminology object) have no opt-in concept — always
  // allow check-in day-of, matching pre-existing behavior. Items events opt
  // in via a configured checkinCta; leaving it blank (e.g. a Survey with
  // nothing to check in to) hides the card entirely regardless of date.
  const checkinConfigured = !event.terminology || event.terminology.checkinCta !== '';
  const showCheckin = eventIsToday && checkinConfigured;
  const checkinCtaLabel = event.terminology?.checkinCta || 'Check in';
  // Same opt-in rule for the cancel/manage-registration link — not every
  // event type has a cancellable registration (e.g. a Survey).
  const manageOrCancelLinkText = event.terminology
    ? (event.selfServiceEditEnabled ? event.terminology.manageLinkText : event.terminology.cancelLinkText)
    : (event.selfServiceEditEnabled ? 'Already registered? Edit or cancel your registration' : 'Need to cancel registration?');

  const theme = getEventTheme(event.categoryBgColor);

  return (
    <div
      className="min-h-screen bg-slate-100 relative"
      style={{ '--btn-color': theme.btnColor, '--btn-hover': theme.btnHover, '--btn-ring': theme.btnRing } as React.CSSProperties}
    >

      {/* ═══════════════ BOARDING-PASS HEADER ═══════════════ */}
      <div className="mx-auto max-w-lg px-5 pt-6">
        <motion.div variants={containerVariants} initial="hidden" animate="visible">

          {/* Parent breadcrumb */}
          {event.parentEventId && event.parentEventName && (
            <motion.div variants={itemVariants} className="mb-2">
              <button
                onClick={() => router.push(`/events/${event.parentEventId}/home`)}
                className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
              >
                &larr; {event.parentEventName}
              </button>
            </motion.div>
          )}

          {/* Eyebrow strip */}
          <motion.div variants={itemVariants} className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">MEANT360</span>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: eventIsToday ? '#10b981' : event.status === 'Completed' ? '#94a3b8' : event.status === 'Cancelled' ? '#f87171' : 'var(--btn-color)' }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                eventIsToday ? 'bg-emerald-500 animate-pulse' :
                event.status === 'Completed' ? 'bg-slate-400' :
                event.status === 'Cancelled' ? 'bg-red-400' : 'bg-[var(--btn-color)]'
              }`} />
              {eventIsToday ? 'Live Today' : event.status}
            </span>
          </motion.div>

          <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={event.categoryLogoUrl || '/logo.png'}
                  alt={event.name}
                  className="w-10 h-10 rounded-lg border border-slate-100 object-cover flex-shrink-0"
                />
                <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                  {event.name}
                </h1>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                <HiOutlineCalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono tabular-nums">{eventIsToday ? 'Today' : formatDate(event.date)}</span>
              </div>
            </div>
            {/* Perforation */}
            <div className="relative border-t-2 border-dashed border-slate-200 mx-5">
              <span className="absolute -top-[9px] -left-[29px] w-[18px] h-[18px] rounded-full bg-slate-100" />
              <span className="absolute -top-[9px] -right-[29px] w-[18px] h-[18px] rounded-full bg-slate-100" />
            </div>
            {/* Availability (only when this event actually has a capacity
                limit — meaningless for a Survey/no-capacity event) + registration status */}
            <div className={`flex items-center px-5 py-3 ${event.capacity > 0 ? 'justify-between' : ''}`}>
              {event.capacity > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Availability</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {event.spotsRemaining === 0 ? 'Full' : <span className="font-mono tabular-nums">{event.spotsRemaining} left</span>}
                  </p>
                </div>
              )}
              <div className={event.capacity > 0 ? 'text-right' : ''}>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Registration</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{registrationOpen ? 'Open' : 'Closed'}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="relative z-10 mx-auto max-w-lg px-5 mt-3">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">

          {/* ── ACTION CARDS ── */}
          {/* Register floats in a fixed bar above the bottom nav instead (see
              near the EventBottomNav render below) — Check-in stays an
              in-page card since it's secondary and only shows on event day. */}
          {showCheckin && (
            <motion.div variants={itemVariants}>
              <motion.button
                onClick={() => router.push(`/events/${eventId}/checkin`)}
                className="w-full rounded-xl p-4 text-left bg-white border border-slate-200 transition-transform active:scale-[0.98]"
                whileTap={{ scale: 0.98 }}
              >
                <p className="text-base font-bold text-slate-900 leading-tight">{checkinCtaLabel} &rarr;</p>
              </motion.button>
            </motion.div>
          )}

          {/* ── MANAGE REGISTRATION ── */}
          {event.status === 'Upcoming' && registrationOpen && manageOrCancelLinkText && (
            <motion.div variants={itemVariants}>
              <button
                onClick={() => router.push(`/events/${eventId}/register`)}
                className="w-full text-center text-sm underline transition-colors py-2"
                style={{ color: 'var(--btn-color)' }}
              >
                {manageOrCancelLinkText}
              </button>
            </motion.div>
          )}

          {/* ── EVENT DESCRIPTION ── */}
          {event.description && (
            <motion.div variants={itemVariants} className="bg-white rounded-xl p-5 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">About This Event</p>
              <div className="relative">
                <div className={`text-sm text-slate-600 leading-relaxed whitespace-pre-line ${!descExpanded ? 'line-clamp-3' : ''}`}>
                  {event.description}
                </div>
                {!descExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
                )}
              </div>
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                className="text-xs font-medium transition-colors mt-2"
                style={{ color: 'var(--btn-color)' }}
              >
                {descExpanded ? 'Show less' : 'Read more'}
              </button>
            </motion.div>
          )}

          {/* ── SPONSORS ── */}
          {(sponsors.eventSponsors.length > 0 || sponsors.generalSponsors.length > 0) && (
            <motion.div variants={itemVariants} className="bg-white rounded-xl p-5 border border-slate-200">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Our Sponsors</p>
              {sponsors.eventSponsors.length > 0 && (
                <div className={sponsors.generalSponsors.length > 0 ? 'mb-4' : ''}>
                  {sponsors.generalSponsors.length > 0 && (
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Event Sponsors</p>
                  )}
                  <SponsorGroupList sponsors={sponsors.eventSponsors} />
                </div>
              )}
              {sponsors.generalSponsors.length > 0 && (
                <div>
                  {sponsors.eventSponsors.length > 0 && (
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Community Sponsors</p>
                  )}
                  <SponsorGroupList sponsors={sponsors.generalSponsors} />
                </div>
              )}
            </motion.div>
          )}

          {/* ── CAPACITY / AVAILABILITY ── */}
          {event.capacity > 0 && (() => {
            const fillPct = Math.min(100, Math.round(((event.capacity - Math.max(0, event.spotsRemaining)) / event.capacity) * 100));
            const unitLabel = event.capacityMode === 'per_adult' ? 'spot' : event.capacityMode === 'per_kid' ? 'spot' : 'spot';
            return (
              <motion.div variants={itemVariants} className="bg-white rounded-xl p-5 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Availability</p>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: event.spotsRemaining === 0 ? '#f59e0b' : 'var(--btn-color)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
                {event.spotsRemaining === 0 ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-amber-600">Event at Capacity</p>
                    <p className="text-xs text-amber-500 mt-1">
                      {registrationOpen ? 'Join waitlist • ' : ''}{event.waitlistCount} on waitlist
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{event.spotsRemaining}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">more {unitLabel}{event.spotsRemaining !== 1 ? 's' : ''} left</p>
                  </div>
                )}
              </motion.div>
            );
          })()}

          {/* ── PERFORMANCE SLOTS ── */}
          {!!event.activityMaxSlots && event.activityMaxSlots > 0 && (() => {
            const filled = Math.min(event.totalActivitySlots, event.activityMaxSlots!);
            const remaining = Math.max(0, event.activityMaxSlots! - event.totalActivitySlots);
            const fillPct = Math.min(100, Math.round((filled / event.activityMaxSlots!) * 100));
            return (
              <motion.div variants={itemVariants} className="bg-white rounded-xl p-5 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{getActivityLabels(parseActivityMode(event.activities || '')).registrationNounPlural}</p>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: remaining === 0 ? '#f59e0b' : 'var(--btn-color)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{remaining}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {remaining === 0 ? 'No slots remaining' : `of ${event.activityMaxSlots} slot${event.activityMaxSlots !== 1 ? 's' : ''} left`}
                  </p>
                </div>
              </motion.div>
            );
          })()}

          {/* ── PRICING ── */}
          {hasPricing && (
            <motion.div variants={itemVariants} className={`bg-white rounded-xl p-5 border border-slate-200`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <div className={`bg-slate-50 rounded-xl px-3 py-3 text-center`}>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Member</p>
                  <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                    ${rules.memberPricingModel === 'family' ? rules.memberFamilyPrice : rules.memberAdultPrice}
                  </p>
                  <p className="text-[10px] text-slate-400">{rules.memberPricingModel === 'family' ? 'per family' : 'per adult'}</p>
                </div>
                <div className={`bg-slate-50 rounded-xl px-3 py-3 text-center`}>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Guest</p>
                  <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">${rules.guestAdultPrice}</p>
                  <p className="text-[10px] text-slate-400">per adult</p>
                </div>
              </div>
              {rules.guestKidPrice > 0 && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  Guest kids: ${rules.guestKidPrice} each
                  {rules.guestKidFreeUnderAge > 0 && ` (${rules.guestKidFreeUnderAge} and under free)`}
                </p>
              )}
              {rules.siblingDiscount.enabled && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs font-semibold text-blue-700">
                    Sibling Discount: {rules.siblingDiscount.type === 'percent'
                      ? `${rules.siblingDiscount.value}% off`
                      : `$${rules.siblingDiscount.value} off`} per additional kid
                  </p>
                </div>
              )}
              {rules.multiEventDiscount.enabled && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs font-semibold text-purple-700">
                    Multi-Activity Discount: {rules.multiEventDiscount.type === 'percent'
                      ? `${rules.multiEventDiscount.value}% off`
                      : `$${rules.multiEventDiscount.value} off`} when registering for {rules.multiEventDiscount.minEvents}+ activities
                  </p>
                </div>
              )}
              {rules.earlyBirdDiscount?.enabled && rules.earlyBirdDiscount.endDate && (() => {
                const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
                const isActive = today <= rules.earlyBirdDiscount.endDate;
                const discountLabel = rules.earlyBirdDiscount.type === 'percent'
                  ? `${rules.earlyBirdDiscount.value}% off`
                  : `$${rules.earlyBirdDiscount.value} off`;
                return isActive ? (
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-xs font-semibold text-emerald-700">
                      Early Bird: {discountLabel}
                    </p>
                    <p className="text-[10px] text-emerald-500 mt-0.5">
                      Register by {parseLocalDate(rules.earlyBirdDiscount.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 text-center mt-2">
                    Early bird pricing has ended
                  </p>
                );
              })()}
            </motion.div>
          )}

          {/* ── SUB-EVENTS / ACTIVITIES ── */}
          <AnimatePresence>
            {event.subEvents && event.subEvents.length > 0 && (
              <motion.div variants={itemVariants} className={`bg-white rounded-xl p-5 border border-slate-200`}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Activities</p>
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
                        className={`w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:opacity-80 transition-colors text-left group`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{sub.name}</p>
                          <p className="text-xs text-slate-400">{formatDateShort(sub.date)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs font-semibold text-slate-500 font-mono tabular-nums">{subPrice}</span>
                          <HiOutlineChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── UPCOMING EVENTS ── */}
          {/* Already nearest-first via buildUpcomingEventsList's date sort —
              the first card just gets a visible "Next" badge to make that
              explicit instead of relying on implicit ordering. */}
          {hasUpcoming && (
            <motion.div variants={itemVariants}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">More from MEANT360</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {event.upcomingEvents.map((ue, i) => {
                  const daysAway = Math.round((parseLocalDate(ue.date).getTime() - Date.now()) / 86400000);
                  return (
                    <button
                      key={ue.id}
                      onClick={() => router.push(`/events/${ue.id}/home`)}
                      className="flex-none w-36 text-left bg-white rounded-xl border border-slate-200 overflow-hidden"
                    >
                      <div className="h-14 bg-slate-800 relative flex items-center justify-center">
                        <img src={ue.categoryLogoUrl || '/logo.png'} alt="" className="w-8 h-8 rounded-md object-cover" />
                        {i === 0 && (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-bold uppercase tracking-wide bg-[var(--btn-color)] text-white px-1.5 py-0.5 rounded">Next</span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-slate-900 truncate">{ue.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                          {formatDateShort(ue.date)}{daysAway >= 0 && ` · ${daysAway === 0 ? 'today' : `in ${daysAway}d`}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── SOCIAL LINKS ── */}
          {/* The QR points to a dedicated /connect subpage listing every
              configured platform, rather than straight to one platform's
              own URL — a single scannable code that doesn't force scanners
              to commit to just whichever platform happened to be listed
              first, and keeps signage/flyers down to one QR instead of one
              per platform. */}
          {activeSocial.length > 0 && (() => {
            const connectUrl = `${origin}/connect`;
            return (
              <motion.div variants={itemVariants} className="bg-white rounded-xl p-5 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Stay Connected</p>
                <div className="flex items-center gap-4">
                  <a href="/connect" className="bg-slate-50 rounded-lg p-2 flex-shrink-0">
                    {origin && <QRCode value={connectUrl} size={64} level="M" />}
                  </a>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">Scan to follow the association everywhere.</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {activeSocial.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          <span
                            key={platform.key}
                            className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center"
                            title={platform.label}
                          >
                            <Icon className="w-3.5 h-3.5 text-slate-600" />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()}

        </motion.div>

        {/* ── FOOTER ── */}
        <div className={`text-center py-6 mt-2 ${showRegister ? 'pb-36' : 'pb-20'}`}>
          <p className="text-[10px] text-slate-300 font-medium mb-0.5">Powered by MEANT Digital Team</p>
          <p className="text-[10px] text-slate-300">
            &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
          </p>
        </div>
      </div>

      {/* Register floats above the bottom nav rather than living in-page, so
          it's always one tap away regardless of scroll position. */}
      {showRegister && (
        <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto px-5 z-20">
          <motion.button
            onClick={() => router.push(`/events/${eventId}/register`)}
            className="w-full rounded-xl p-4 flex items-center justify-end text-right text-white shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: 'var(--btn-color)' }}
            whileTap={{ scale: 0.98 }}
          >
            <p className="text-base font-bold text-white leading-tight">
              {event.spotsRemaining === 0 ? 'Join Waitlist' : (event.terminology?.actionVerb || 'Register')} &rarr;
            </p>
          </motion.button>
        </div>
      )}

      <EventBottomNav
        eventId={eventId}
        active="home"
        eventDate={event.date}
        registerLabel={event.terminology?.registerCta}
        checkinLabel={event.terminology?.checkinCta}
      />
    </div>
  );
}
