import { eventAttendanceRepository } from '@/repositories/event-attendance.repository';
import { memberRepository, memberSpouseRepository } from '@/repositories';
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
 * Merges spouse attendance into the primary member's leaderboard entry.
 * Spouse entries are removed from the result; their points/events are added
 * to the primary member's totals. Tier is recalculated after merging.
 */
function combineSpousePoints(
  entries: {
    email: string;
    name: string;
    eventsAttended: number;
    points: number;
    memberId?: string | null;
    year: number;
  }[],
  // Map: lowercase spouse email → primary member's memberId
  spouseEmailToMemberId: Map<string, string>,
): typeof entries {
  // Index primary entries by memberId for O(1) merge
  const byMemberId = new Map<string, (typeof entries)[number]>();
  const spouseEntries: (typeof entries)[number][] = [];

  for (const entry of entries) {
    const primaryMemberId = entry.email ? spouseEmailToMemberId.get(entry.email.toLowerCase()) : undefined;
    if (primaryMemberId) {
      spouseEntries.push({ ...entry, _primaryMemberId: primaryMemberId } as typeof entry & { _primaryMemberId: string });
    } else if (entry.memberId) {
      byMemberId.set(entry.memberId, { ...entry });
    }
  }

  // Merge spouse data into primary member entries
  for (const spouse of spouseEntries) {
    const primaryMemberId = (spouse as typeof spouse & { _primaryMemberId?: string })._primaryMemberId;
    if (!primaryMemberId) continue;
    const primary = byMemberId.get(primaryMemberId);
    if (primary) {
      primary.eventsAttended += spouse.eventsAttended;
      primary.points += spouse.points;
    }
    // If the primary member has no attendance yet, they won't be in byMemberId —
    // spouse entry is still dropped since we can't link without a primary row.
  }

  // Entries without a memberId that aren't spouses are kept as-is
  const standalone = entries.filter(
    (e) => !e.memberId && !(e.email && spouseEmailToMemberId.has(e.email.toLowerCase())),
  );

  return [...byMemberId.values(), ...standalone];
}

/**
 * Get engagement leaderboard for admin view.
 * Returns entries with member names resolved and spouse points combined.
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

  // Build spouse email → primary memberId map
  const allSpouses = await memberSpouseRepository.findAll();
  const spouseEmailToMemberId = new Map<string, string>();
  for (const spouse of allSpouses) {
    if (spouse.email && spouse.memberId) {
      spouseEmailToMemberId.set(spouse.email.toLowerCase(), spouse.memberId);
    }
  }

  const rawEntries = leaderboard.map((entry) => ({
    email: entry.email,
    name: entry.memberId ? memberNameMap.get(entry.memberId) || '' : '',
    eventsAttended: entry.eventsAttended,
    points: entry.points,
    memberId: entry.memberId ?? null,
    year: targetYear,
  }));

  const merged = combineSpousePoints(rawEntries, spouseEmailToMemberId);

  return merged
    .sort((a, b) => b.points - a.points)
    .map((entry) => {
      const tier = getEngagementTier(entry.eventsAttended);
      return {
        email: entry.email,
        name: entry.name,
        eventsAttended: entry.eventsAttended,
        points: entry.points,
        tier: tier.name,
        tierColor: tier.color,
        tierBadge: tier.badge,
        year: targetYear,
      };
    });
}
