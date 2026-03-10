import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  return toStringRecord(row);
}

export const eventAttendanceRepository = {
  async findByEventIdAndEmail(eventId: string, email: string): Promise<Record<string, string> | null> {
    const row = await prisma.eventAttendance.findUnique({
      where: { eventId_email: { eventId, email } },
    });
    return row ? toRecord(row) : null;
  },

  async create(data: {
    id: string;
    eventId: string;
    email: string;
    memberId: string | null;
    checkedInAt: string;
    pointsAwarded: number;
    year: number;
    createdAt: string;
  }): Promise<Record<string, string>> {
    const row = await prisma.eventAttendance.create({
      data: {
        id: data.id,
        eventId: data.eventId,
        email: data.email,
        memberId: data.memberId || null,
        checkedInAt: data.checkedInAt,
        pointsAwarded: data.pointsAwarded,
        year: data.year,
        createdAt: data.createdAt,
      },
    });
    return toRecord(row);
  },

  async getLeaderboard(year: number): Promise<{ email: string; memberId: string | null; eventsAttended: number; points: number }[]> {
    const results = await prisma.eventAttendance.groupBy({
      by: ['email', 'memberId'],
      where: { year },
      _count: { id: true },
      _sum: { pointsAwarded: true },
      orderBy: { _sum: { pointsAwarded: 'desc' } },
    });
    return results.map((r) => ({
      email: r.email,
      memberId: r.memberId,
      eventsAttended: r._count.id,
      points: r._sum.pointsAwarded || 0,
    }));
  },

  async getByEmail(email: string, year: number): Promise<{ eventsAttended: number; points: number }> {
    const result = await prisma.eventAttendance.aggregate({
      where: { email: { equals: email, mode: 'insensitive' }, year },
      _count: { id: true },
      _sum: { pointsAwarded: true },
    });
    return {
      eventsAttended: result._count.id,
      points: result._sum.pointsAwarded || 0,
    };
  },
};
