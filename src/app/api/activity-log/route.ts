import { NextRequest } from 'next/server';
import { activityLogRepository } from '@/repositories';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userEmail = searchParams.get('userEmail');
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const year = searchParams.get('year');
    if (year && !startDate && !endDate) {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '200', 10);

    let rows = await activityLogRepository.findAll();

    if (action) rows = rows.filter((r) => r.action === action);
    if (entityType) {
      const types = entityType.split(',').map((t) => t.trim());
      rows = rows.filter((r) => types.includes(r.entityType));
    }
    if (userEmail) rows = rows.filter((r) => r.userEmail === userEmail);
    if (startDate) rows = rows.filter((r) => r.timestamp >= startDate);
    if (endDate) rows = rows.filter((r) => r.timestamp <= endDate + 'T23:59:59');
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.entityLabel?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.userEmail?.toLowerCase().includes(q) ||
          r.entityType?.toLowerCase().includes(q),
      );
    }

    // Sort by timestamp descending (newest first)
    rows.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // Apply limit
    if (limit > 0) rows = rows.slice(0, limit);

    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/activity-log error:', error);
    return errorResponse('Failed to fetch activity log', 500, error);
  }
}
