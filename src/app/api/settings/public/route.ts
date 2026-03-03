import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { getPublicSettings } from '@/services/settings.service';

export async function GET() {
  try {
    const publicSettings = await getPublicSettings();
    return jsonResponse(publicSettings);
  } catch (error) {
    console.error('GET /api/settings/public error:', error);
    return errorResponse('Failed to fetch settings', 500, error);
  }
}
