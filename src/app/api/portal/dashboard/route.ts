import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { memberRepository, eventParticipantRepository } from '@/repositories';
import { NextResponse } from 'next/server';

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

    return jsonResponse({
      name: member.name,
      spouseName: member.spouseName || '',
      status: member.status,
      membershipType: member.membershipType,
      membershipYears: member.membershipYears,
      renewalDate: member.renewalDate,
      registrationDate: member.registrationDate,
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
