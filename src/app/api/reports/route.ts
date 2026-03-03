import { NextRequest } from 'next/server';
import { errorResponse, requireAuth } from '@/lib/api-helpers';
import { handleEventReport, handleMonthlyReport, handleAnnualReport } from '@/services/reports.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const formatParam = searchParams.get('format') || 'pdf';

    if (!type) {
      return errorResponse('Report type is required (event, monthly, annual)');
    }

    if (type === 'event') {
      return await handleEventReport(searchParams, formatParam);
    } else if (type === 'monthly') {
      return await handleMonthlyReport(searchParams, formatParam);
    } else if (type === 'annual') {
      return await handleAnnualReport(searchParams, formatParam);
    } else {
      return errorResponse('Invalid report type');
    }
  } catch (error) {
    console.error('GET /api/reports error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate report';
    return errorResponse(message, 500, error);
  }
}
