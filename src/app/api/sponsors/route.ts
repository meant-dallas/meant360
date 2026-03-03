import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { sponsorCreateSchema, sponsorUpdateSchema } from '@/types/schemas';
import { sponsorService, searchSponsors } from '@/services/sponsors.service';
import { NotFoundError } from '@/services/crud.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rows = await searchSponsors({
      search: searchParams.get('search') || undefined,
      active: searchParams.get('active') || undefined,
      year: searchParams.get('year') || undefined,
      status: searchParams.get('status') || undefined,
      type: searchParams.get('type') || undefined,
    });
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/sponsors error:', error);
    return errorResponse('Failed to fetch sponsors', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(sponsorCreateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await sponsorService.create(validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/sponsors error:', error);
    return errorResponse('Failed to create sponsor', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(sponsorUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const updated = await sponsorService.update(validated.id, validated as unknown as Record<string, unknown>, { userEmail: auth.email });
    return jsonResponse(updated);
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('PUT /api/sponsors error:', error);
    return errorResponse('Failed to update sponsor', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    await sponsorService.remove(id, { userEmail: auth.email });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof NotFoundError) return errorResponse(error.message, 404);
    console.error('DELETE /api/sponsors error:', error);
    return errorResponse('Failed to delete sponsor', 500, error);
  }
}
