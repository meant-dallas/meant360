import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { itemsCancelSelectionSchema } from '@/types/schemas';
import { cancelItemSelection } from '@/services/event-items.service';
import { NotFoundError } from '@/services/crud.service';

export const dynamic = 'force-dynamic';

// Admin/committee only — see the whole-registration cancel route for why.
export async function POST(
  request: NextRequest,
  { params }: { params: { registrationId: string; itemSelectionId: string } },
) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = await validateBody(itemsCancelSelectionSchema, body);
    if (validated instanceof NextResponse) return validated;

    const result = await cancelItemSelection(params.registrationId, params.itemSelectionId, { reason: validated.reason });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('POST /api/events/[eventId]/items-registrations/[registrationId]/items/[itemSelectionId]/cancel error:', error);
    return errorResponse('Failed to cancel item', 500, error);
  }
}
