import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { memberRepository, eventParticipantRepository } from '@/repositories';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const [members, participants] = await Promise.all([
      memberRepository.findAll(),
      eventParticipantRepository.findAll(),
    ]);

    const member = members.find((m) => m.id === auth.memberId);
    if (!member) {
      return errorResponse('Member record not found', 404);
    }

    // Count events where this member registered or email matches
    const myParticipations = participants.filter(
      (p) => p.memberId === auth.memberId || p.email?.toLowerCase() === auth.email.toLowerCase(),
    );

    const totalEventsRegistered = myParticipations.length;
    const totalEventsAttended = myParticipations.filter((p) => p.checkedInAt).length;

    const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.name;

    // Check for missing mandatory fields
    const missingFields: string[] = [];
    if (!member.firstName?.trim()) missingFields.push('First Name');
    if (!member.lastName?.trim()) missingFields.push('Last Name');
    if (!member.phone?.trim()) missingFields.push('Phone');

    // Check address
    const addresses = await prisma.memberAddress.findMany({ where: { memberId: auth.memberId } });
    const addr = addresses[0];
    if (!addr || !addr.street?.trim() || !addr.city?.trim() || !addr.state?.trim() || !addr.zipCode?.trim()) {
      missingFields.push('Address');
    }

    // Check spouse for Family membership
    const isFamilyMembership = member.membershipType?.toLowerCase().includes('family');
    if (isFamilyMembership) {
      const spouses = await prisma.memberSpouse.findMany({ where: { memberId: auth.memberId } });
      const sp = spouses[0];
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
    return errorResponse('Failed to load dashboard', 500, error);
  }
}
