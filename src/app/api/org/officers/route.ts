import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody } from '@/lib/api-helpers';
import { orgOfficerRepository } from '@/repositories';
import { logActivity } from '@/lib/audit-log';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

const officerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().default(''),
  group: z.enum(['BoD', 'Chair', '']).default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  status: z.enum(['Active', 'Former']).default('Active'),
  portalRole: z.enum(['admin', 'committee', '']).default(''),
});

const officerUpdateSchema = z.object({
  id: z.string().min(1),
}).passthrough();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const rows = await orgOfficerRepository.findAll();
    return jsonResponse(rows);
  } catch (error) {
    console.error('GET /api/org/officers error:', error);
    Sentry.captureException(error, { extra: { context: 'Org officers GET' } });
    return errorResponse('Failed to fetch officers', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(officerSchema, body);
    if (validated instanceof NextResponse) return validated;

    const record = await orgOfficerRepository.create(validated as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'create',
      entityType: 'OrgOfficer',
      entityId: record.id,
      entityLabel: `${validated.name} (${validated.role})`,
    });

    return jsonResponse(record, 201);
  } catch (error) {
    console.error('POST /api/org/officers error:', error);
    Sentry.captureException(error, { extra: { context: 'Org officers POST' } });
    return errorResponse('Failed to create officer', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(officerUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const existing = await orgOfficerRepository.findById(validated.id);
    if (!existing) return errorResponse('Officer not found', 404);

    const { id, ...data } = validated;
    const updated = await orgOfficerRepository.update(id, data as unknown as Record<string, unknown>);

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'OrgOfficer',
      entityId: id,
      entityLabel: `${updated.name} (${updated.role})`,
    });

    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/org/officers error:', error);
    Sentry.captureException(error, { extra: { context: 'Org officers PUT' } });
    return errorResponse('Failed to update officer', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    const existing = await orgOfficerRepository.findById(id);
    if (!existing) return errorResponse('Officer not found', 404);

    await orgOfficerRepository.delete(id);

    logActivity({
      userEmail: auth.email,
      action: 'delete',
      entityType: 'OrgOfficer',
      entityId: id,
      entityLabel: `${existing.name} (${existing.role})`,
    });

    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/org/officers error:', error);
    Sentry.captureException(error, { extra: { context: 'Org officers DELETE' } });
    return errorResponse('Failed to delete officer', 500, error);
  }
}
