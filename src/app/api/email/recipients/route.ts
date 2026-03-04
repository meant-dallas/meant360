import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { memberRepository, memberSpouseRepository, guestRepository } from '@/repositories';

interface Recipient {
  email: string;
  name: string;
  type: 'member' | 'guest';
}

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const recipients: Recipient[] = [];

    if (type === 'members' || type === 'all') {
      const [members, spouses] = await Promise.all([
        memberRepository.findAll(),
        memberSpouseRepository.findAll(),
      ]);

      // Build memberId -> member name map for spouse name fallback
      const memberNameMap = new Map<string, string>();
      for (const m of members) {
        if (m.email) {
          recipients.push({ email: m.email, name: m.name || m.email, type: 'member' });
        }
        memberNameMap.set(m.id, m.name || m.email);
      }

      // Add spouse emails
      for (const s of spouses) {
        if (s.email) {
          const spouseName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email;
          recipients.push({ email: s.email, name: spouseName, type: 'member' });
        }
      }
    }

    if (type === 'guests' || type === 'all') {
      const guests = await guestRepository.findAll();
      for (const g of guests) {
        if (g.email) {
          recipients.push({ email: g.email, name: g.name || g.email, type: 'guest' });
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
