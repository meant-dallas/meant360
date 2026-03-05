import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { membershipApplicationService } from '@/services/membership-application.service';

export const dynamic = 'force-dynamic';

// GET /api/membership-applications/list — admin only
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const filters: Record<string, string | null | undefined> = {};
    const status = searchParams.get('status');
    if (status) filters.status = status;
    const rows = await membershipApplicationService.listApplications(filters);
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/membership-applications/list error:', error);
    return errorResponse('Failed to fetch applications', 500, error);
  }
}
