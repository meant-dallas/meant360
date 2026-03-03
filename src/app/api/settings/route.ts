import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { settingsUpdateSchema } from '@/types/schemas';
import { getSettings, upsertBulk } from '@/services/settings.service';
import { logActivity } from '@/lib/audit-log';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const settings = await getSettings();
    return jsonResponse(settings);
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return errorResponse('Failed to fetch settings', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(settingsUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const count = await upsertBulk(validated.settings, auth.email);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'Settings',
      entityId: 'settings',
      entityLabel: `${count} setting(s)`,
      description: `Updated ${count} setting(s): ${Object.keys(validated.settings).join(', ')}`,
    });

    return jsonResponse({ updated: count });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return errorResponse('Failed to update settings', 500, error);
  }
}
