import { eventAttendanceRepository } from '@/repositories/event-attendance.repository';
import { memberRepository } from '@/repositories';
import { generateId } from '@/lib/utils';

const POINTS_PER_EVENT = 10;

export interface EngagementTier {
  name: 'Pathfinder' | 'Explorer' | 'Adventurer' | 'Trailblazer' | 'Legend';
  minEvents: number;
  maxEvents: number;
  color: string;
  badge: string;
}

const TIERS: EngagementTier[] = [
  { name: 'Legend',       minEvents: 11, maxEvents: 15, color: '#f59e0b', badge: '/badges/legend.png' },
  { name: 'Trailblazer',  minEvents: 7,  maxEvents: 10, color: '#8b5cf6', badge: '/badges/trailblazer.png' },
  { name: 'Adventurer',   minEvents: 4,  maxEvents: 6,  color: '#3b82f6', badge: '/badges/adventurer.png' },
  { name: 'Explorer',     minEvents: 1,  maxEvents: 3,  color: '#10b981', badge: '/badges/explorer.png' },
  { name: 'Pathfinder',   minEvents: 0,  maxEvents: 0,  color: '#6b7280', badge: '/badges/pathfinder.png' },
];

export function getEngagementTier(eventsAttended: number): EngagementTier {
  return TIERS.find((t) => eventsAttended >= t.minEvents) || TIERS[TIERS.length - 1];
}

/**
 * Record attendance when a participant is checked in.
 * Silently skips if already recorded for this event+email.
 */
export async function recordAttendance(
  eventId: string,
  email: string,
  memberId: string | null,
  checkedInAt: string,
): Promise<void> {
  const emailLower = email.toLowerCase().trim();
  const existing = await eventAttendanceRepository.findByEventIdAndEmail(eventId, emailLower);
  if (existing) return; // Already recorded

  const year = new Date(checkedInAt).getFullYear();
  const now = new Date().toISOString();

  await eventAttendanceRepository.create({
    id: generateId(),
    eventId,
    email: emailLower,
    memberId: memberId || null,
    checkedInAt,
    pointsAwarded: POINTS_PER_EVENT,
    year,
    createdAt: now,
  });
}

/**
 * Get engagement stats for a specific email and year.
 */
export async function getMemberEngagement(email: string, year?: number) {
  const targetYear = year || new Date().getFullYear();
  const stats = await eventAttendanceRepository.getByEmail(email, targetYear);
  const tier = getEngagementTier(stats.eventsAttended);
  return { ...stats, tier: tier.name, tierColor: tier.color, tierBadge: tier.badge };
}

/**
 * Get engagement leaderboard for admin view.
 * Returns entries with member names resolved.
 */
export async function getEngagementLeaderboard(year?: number) {
  const targetYear = year || new Date().getFullYear();
  const leaderboard = await eventAttendanceRepository.getLeaderboard(targetYear);

  // Resolve member names for entries with memberId
  const memberIds = leaderboard
    .map((e) => e.memberId)
    .filter((id): id is string => !!id);

  const memberNameMap = new Map<string, string>();
  if (memberIds.length > 0) {
    const uniqueIds = Array.from(new Set(memberIds));
    const members = await Promise.all(
      uniqueIds.map((id) => memberRepository.findById(id)),
    );
    members.forEach((m) => {
      if (m) memberNameMap.set(m.id, m.name || `${m.firstName} ${m.lastName}`.trim());
    });
  }

  return leaderboard.map((entry) => {
    const tier = getEngagementTier(entry.eventsAttended);
    return {
      email: entry.email,
      name: entry.memberId ? memberNameMap.get(entry.memberId) || '' : '',
      eventsAttended: entry.eventsAttended,
      points: entry.points,
      tier: tier.name,
      tierColor: tier.color,
      tierBadge: tier.badge,
      year: targetYear,
    };
  });
}
