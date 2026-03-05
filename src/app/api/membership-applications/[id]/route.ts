import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse, requireAuth } from '@/lib/api-helpers';
import { membershipApplicationService } from '@/services/membership-application.service';

export const dynamic = 'force-dynamic';

// GET /api/membership-applications/[id] — admin only
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const app = await membershipApplicationService.getApplication(params.id);
    return jsonResponse(app);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch application';
    if (message === 'Application not found') return errorResponse(message, 404);
    console.error('GET /api/membership-applications/[id] error:', error);
    return errorResponse(message, 500, error);
  }
}

// PUT /api/membership-applications/[id] — admin only, approve or reject
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === 'approve') {
      const result = await membershipApplicationService.approveApplication(
        params.id,
        auth.email,
        body.approverName || auth.email,
      );
      return jsonResponse(result);
    }

    if (action === 'reject') {
      const reason = body.reason || '';
      const result = await membershipApplicationService.rejectApplication(
        params.id,
        auth.email,
        reason,
      );
      return jsonResponse(result);
    }

    return errorResponse('Invalid action. Use "approve" or "reject".', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update application';
    if (message === 'Application not found') return errorResponse(message, 404);
    if (message.includes('already approved') || message.includes('not in Pending')) {
      return errorResponse(message, 409);
    }
    console.error('PUT /api/membership-applications/[id] error:', error);
    return errorResponse(message, 500, error);
  }
}
