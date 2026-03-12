import { jsonResponse, errorResponse, requireMember } from '@/lib/api-helpers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    return jsonResponse({ memberId: auth.memberId });
  } catch (error) {
    return errorResponse('Failed to get member ID', 500, error);
  }
}
