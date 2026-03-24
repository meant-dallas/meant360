import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { isBoDMember } from '@/services/membership-application.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const isBoD = await isBoDMember(auth.email);
    return jsonResponse({ isBoD });
  } catch (error) {
    return errorResponse('Failed to check BoD status', 500, error);
  }
}
