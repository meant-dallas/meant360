import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { orgInfoRepository } from '@/repositories';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const orgInfo = await orgInfoRepository.get();

    // No org info configured at all — that's an alert
    if (!orgInfo) {
      return jsonResponse({ count: 1, hasWarning: false, hasCritical: true });
    }

    let count = 0;
    let hasCritical = false;
    let hasWarning = false;

    // Check missing critical fields
    const criticalFields = ['legalName', 'ein', 'irsStatus', 'incorporationState', 'orgType'];
    for (const field of criticalFields) {
      if (!orgInfo[field]) {
        count++;
        hasCritical = true;
      }
    }

    // Check compliance statuses
    const badStatuses = ['revoked', 'forfeited', 'inactive'];
    for (const field of ['irsStatus', 'franchiseTaxStatus', 'sosRegistrationStatus']) {
      const val = (orgInfo[field] || '').toLowerCase();
      if (val && badStatuses.includes(val)) {
        count++;
        hasCritical = true;
      }
    }

    // Check deadlines
    const deadlineFields = ['franchiseTaxDueDate', 'publicInfoReportDueDate', 'irs990DueDate'];
    for (const field of deadlineFields) {
      const days = daysUntil(orgInfo[field]);
      if (days !== null) {
        if (days < 0) { count++; hasCritical = true; }        // overdue
        else if (days <= 30) { count++; hasWarning = true; }   // upcoming
      }
    }

    return jsonResponse({ count, hasWarning, hasCritical });
  } catch (error) {
    console.error('GET /api/org/alerts error:', error);
    Sentry.captureException(error, { extra: { context: 'Org alerts GET' } });
    return errorResponse('Failed to check org alerts', 500, error);
  }
}
