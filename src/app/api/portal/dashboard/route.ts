import * as Sentry from '@sentry/nextjs';
import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { toStringRecord } from '@/repositories/base.repository';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const memberId = auth.memberId;
    const [memberRaw, ptcRaw, addrRaw, spouseRaw] = await Promise.all([
      prisma.member.findUnique({ where: { id: memberId } }),
      prisma.eventParticipant.findMany({
        where: { OR: [{ memberId }, { email: { equals: auth.email, mode: 'insensitive' } }] },
      }),
      prisma.memberAddress.findMany({ where: { memberId } }),
      prisma.memberSpouse.findMany({ where: { memberId } }),
    ]);

    if (!memberRaw) {
      return errorResponse('Member record not found', 404);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = toStringRecord(memberRaw as any);

    const totalEventsRegistered = ptcRaw.length;
    const totalEventsAttended = ptcRaw.filter((p) => p.checkedInAt).length;

    const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.name;

    // Check for missing mandatory fields
    const missingFields: string[] = [];
    if (!member.firstName?.trim()) missingFields.push('First Name');
    if (!member.lastName?.trim()) missingFields.push('Last Name');
    if (!member.phone?.trim()) missingFields.push('Phone');

    // Check address
    const addr = addrRaw[0];
    if (!addr || !addr.street?.trim() || !addr.city?.trim() || !addr.state?.trim() || !addr.zipCode?.trim()) {
      missingFields.push('Address');
    }

    // Check spouse for Family membership
    const isFamilyMembership = member.membershipType?.toLowerCase().includes('family');
    if (isFamilyMembership) {
      const sp = spouseRaw[0];
      if (!sp || !sp.firstName?.trim() || !sp.lastName?.trim() || !sp.email?.trim()) {
        missingFields.push('Spouse Details');
      }
    }

    return jsonResponse({
      name: displayName,
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      spouseName: member.spouseName || '',
      status: member.status,
      membershipType: member.membershipType,
      membershipYears: member.membershipYears,
      renewalDate: member.renewalDate,
      registrationDate: member.registrationDate,
      missingFields,
      stats: {
        totalEventsRegistered,
        totalEventsAttended,
      },
    });
  } catch (error) {
    console.error('Portal dashboard error:', error);
    Sentry.captureException(error, { extra: { context: 'Portal dashboard GET' } });
    return errorResponse('Failed to load dashboard', 500, error);
  }
}
