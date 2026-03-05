import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, validateBody } from '@/lib/api-helpers';
import { emailTemplateSchema, emailTemplateUpdateSchema } from '@/types/schemas';
import { emailTemplateRepository } from '@/repositories';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const templates = await emailTemplateRepository.findAll();
    return jsonResponse(templates);
  } catch (error) {
    console.error('GET /api/email/templates error:', error);
    return errorResponse('Failed to fetch templates', 500, error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(emailTemplateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const template = await emailTemplateRepository.create(validated);
    return jsonResponse(template, 201);
  } catch (error) {
    console.error('POST /api/email/templates error:', error);
    return errorResponse('Failed to create template', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const validated = await validateBody(emailTemplateUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const { id, ...data } = validated;
    const existing = await emailTemplateRepository.findById(id);
    if (!existing) return errorResponse('Template not found', 404);

    const template = await emailTemplateRepository.update(id, data);
    return jsonResponse(template);
  } catch (error) {
    console.error('PUT /api/email/templates error:', error);
    return errorResponse('Failed to update template', 500, error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return errorResponse('Missing id');

    const existing = await emailTemplateRepository.findById(id);
    if (!existing) return errorResponse('Template not found', 404);

    await emailTemplateRepository.delete(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/email/templates error:', error);
    return errorResponse('Failed to delete template', 500, error);
  }
}
