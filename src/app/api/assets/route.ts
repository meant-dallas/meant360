import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireBoD, jsonResponse, errorResponse, validateBody } from '@/lib/api-helpers';
import { logActivity } from '@/lib/audit-log';
import { prisma } from '@/lib/db';
import { assetCreateSchema, assetUpdateSchema } from '@/types/schemas';

export const dynamic = 'force-dynamic';

// Board of Directors only — see requireBoD() for why this can't just be
// requireAuth()/requireAdmin() like most admin routes.
export async function GET() {
  const auth = await requireBoD();
  if (auth instanceof Response) return auth;

  try {
    const assets = await prisma.asset.findMany({ orderBy: { name: 'asc' } });
    return jsonResponse(assets);
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'Assets GET' } });
    return errorResponse('Failed to list assets', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireBoD();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(assetCreateSchema, body);
    if (parsed instanceof Response) return parsed;

    const now = new Date().toISOString();
    const asset = await prisma.asset.create({ data: { ...parsed, createdAt: now, updatedAt: now } });

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'Asset',
      entityId: asset.id,
      entityLabel: asset.name,
      newRecord: asset,
    });

    return jsonResponse(asset, 201);
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'Assets POST' } });
    return errorResponse('Failed to create asset', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireBoD();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(assetUpdateSchema, body);
    if (parsed instanceof Response) return parsed;

    const { id, ...data } = parsed;
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return errorResponse('Asset not found', 404);

    const asset = await prisma.asset.update({ where: { id }, data: { ...data, updatedAt: new Date().toISOString() } });

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'Asset',
      entityId: id,
      entityLabel: asset.name,
      oldRecord: existing,
      newRecord: asset,
    });

    return jsonResponse(asset);
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'Assets PUT' } });
    return errorResponse('Failed to update asset', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBoD();
  if (auth instanceof Response) return auth;

  try {
    const { id } = await request.json();
    if (!id) return errorResponse('id is required', 400);

    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return errorResponse('Asset not found', 404);

    await prisma.asset.delete({ where: { id } });

    logActivity({
      userEmail: auth.email,
      action: 'delete',
      entityType: 'Asset',
      entityId: id,
      entityLabel: existing.name,
      oldRecord: existing,
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'Assets DELETE' } });
    return errorResponse('Failed to delete asset', 500, error);
  }
}
