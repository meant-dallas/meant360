import { eventAttendanceRepository } from '@/repositories/event-attendance.repository';
import { memberRepository } from '@/repositories';
import { generateId } from '@/lib/utils';

const POINTS_PER_EVENT = 10;

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
  return eventAttendanceRepository.getByEmail(email, targetYear);
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

  return leaderboard.map((entry) => ({
    email: entry.email,
    name: entry.memberId ? memberNameMap.get(entry.memberId) || '' : '',
    eventsAttended: entry.eventsAttended,
    points: entry.points,
    year: targetYear,
  }));
}
