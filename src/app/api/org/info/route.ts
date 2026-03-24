import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { orgInfoUpdateSchema } from '@/types/schemas';
import { orgInfoRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const info = await orgInfoRepository.get();
    return jsonResponse(info || {});
  } catch (error) {
    console.error('GET /api/org/info error:', error);
    Sentry.captureException(error, { extra: { context: 'Org info GET' } });
    return errorResponse('Failed to fetch organization info', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(orgInfoUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const result = await orgInfoRepository.upsert(validated as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgInfo',
      entityId: result.id || 'org-info',
      entityLabel: 'Organization Info',
      description: 'Updated organization information',
    });

    return jsonResponse(result);
  } catch (error) {
    console.error('PUT /api/org/info error:', error);
    Sentry.captureException(error, { extra: { context: 'Org info PUT' } });
    return errorResponse('Failed to update organization info', 500, error);
  }
}
