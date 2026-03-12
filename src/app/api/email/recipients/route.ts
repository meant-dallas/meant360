import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { memberRepository, memberSpouseRepository, guestRepository, eventParticipantRepository } from '@/repositories';

interface Recipient {
  email: string;
  name: string;
  type: 'member' | 'guest';
  status: 'active' | 'inactive' | 'guest';
}

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const eventId = searchParams.get('eventId');

    // If eventId provided, return participants from that event
    if (eventId) {
      const participants = await eventParticipantRepository.findByEventId(eventId);
      const eventRecipients: Recipient[] = [];
      for (const p of participants) {
        // Skip participants who opted out of email communications
        if (p.emailConsent === 'false') continue;
        if (p.email) {
          const isGuest = p.type === 'Guest' || !!p.guestId;
          eventRecipients.push({
            email: p.email,
            name: p.name || p.email,
            type: isGuest ? 'guest' : 'member',
            status: isGuest ? 'guest' : 'active',
          });
        }
      }
      // Deduplicate
      const seen = new Set<string>();
      const unique = eventRecipients.filter((r) => {
        const lower = r.email.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
      return jsonResponse(unique);
    }

    const recipients: Recipient[] = [];

    if (type === 'members' || type === 'all') {
      const [members, spouses] = await Promise.all([
        memberRepository.findAll(),
        memberSpouseRepository.findAll(),
      ]);

      // Build memberId -> member status map for spouse status inheritance
      const memberStatusMap = new Map<string, string>();
      for (const m of members) {
        memberStatusMap.set(m.id, m.status || 'Active');
        if (m.email) {
          const isActive = m.status === 'Active';
          recipients.push({
            email: m.email,
            name: m.name || m.email,
            type: 'member',
            status: isActive ? 'active' : 'inactive',
          });
        }
      }

      // Add spouse emails — inherit parent member's status
      for (const s of spouses) {
        if (s.email) {
          const spouseName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email;
          const parentStatus = memberStatusMap.get(s.memberId) || 'Active';
          const isActive = parentStatus === 'Active';
          recipients.push({
            email: s.email,
            name: spouseName,
            type: 'member',
            status: isActive ? 'active' : 'inactive',
          });
        }
      }
    }

    if (type === 'guests' || type === 'all') {
      const guests = await guestRepository.findAll();
      for (const g of guests) {
        if (g.email) {
          recipients.push({
            email: g.email,
            name: g.name || g.email,
            type: 'guest',
            status: 'guest',
          });
        }
      }
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const unique = recipients.filter((r) => {
      const lower = r.email.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    return jsonResponse(unique);
  } catch (error) {
    console.error('GET /api/email/recipients error:', error);
    return errorResponse('Failed to fetch recipients', 500, error);
  }
}
