import { NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { membershipApplicationService } from '@/services/membership-application.service';

export const dynamic = 'force-dynamic';

// POST /api/membership-applications — public, submit application
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const record = await membershipApplicationService.submitApplication(body);
    return jsonResponse(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit application';
    const status = message.includes('already exists') ? 409 : 500;
    console.error('POST /api/membership-applications error:', error);
    return errorResponse(message, status, status === 500 ? error : undefined);
  }
}
