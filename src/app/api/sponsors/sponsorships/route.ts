import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { sponsorshipCreateSchema, sponsorshipUpdateSchema } from '@/types/schemas';
import { sponsorshipService, ensureSponsorFromSponsorship } from '@/services/sponsors.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rows = await sponsorshipService.list({
      eventName: searchParams.get('event'),
      status: searchParams.get('status'),
      type: searchParams.get('type'),
      year: searchParams.get('year'),
    });
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/sponsorship error:', error);
    return errorResponse('Failed to fetch sponsorship records', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(sponsorshipCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await sponsorshipService.create(validated as unknown as Record<string, unknown>);

    // Auto-create or update the sponsor record
    try {
      await ensureSponsorFromSponsorship({
        sponsorName: validated.sponsorName,
        sponsorEmail: validated.sponsorEmail,
        sponsorPhone: validated.sponsorPhone,
      });
    } catch (err) {
      console.error('Auto-create sponsor failed (sponsorship was still created):', err);
    }

    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/sponsorship error:', error);
    return errorResponse('Failed to create sponsorship record', 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(sponsorshipUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await sponsorshipService.update(validated.id, validated as unknown as Record<string, unknown>);
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/sponsorship error:', error);
    return errorResponse('Failed to update sponsorship record', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await sponsorshipService.remove(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/sponsorship error:', error);
    return errorResponse('Failed to delete sponsorship record', 500);
  }
}
