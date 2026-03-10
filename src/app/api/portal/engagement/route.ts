import { NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { getMemberEngagement } from '@/services/engagement.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NEXT_PUBLIC_ENABLE_ENGAGEMENT !== 'true') {
    return jsonResponse({ enabled: false });
  }

  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const year = new Date().getFullYear();
    const stats = await getMemberEngagement(auth.email, year);
    return jsonResponse({ ...stats, enabled: true, year });
  } catch (error) {
    console.error('Portal engagement GET error:', error);
    return errorResponse('Failed to load engagement data', 500, error);
  }
}
