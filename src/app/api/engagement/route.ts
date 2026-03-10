import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { getEngagementLeaderboard } from '@/services/engagement.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_ENGAGEMENT !== 'true') {
    return jsonResponse([]);
  }

  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '', 10) || new Date().getFullYear();
    const leaderboard = await getEngagementLeaderboard(year);
    return jsonResponse(leaderboard);
  } catch (error) {
    console.error('Engagement leaderboard GET error:', error);
    return errorResponse('Failed to load engagement data', 500, error);
  }
}
