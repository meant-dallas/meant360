export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { requireAuth, jsonResponse, errorResponse } from '@/lib/api-helpers';
import { finReportsService } from '@/services/fin-reports.service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const url = request.nextUrl.searchParams;
    const reportType = url.get('reportType');
    const startDate = url.get('startDate') || `${new Date().getFullYear()}-01-01`;
    const endDate = url.get('endDate') || new Date().toISOString().slice(0, 10);
    const eventId = url.get('eventId') || undefined;

    let data;
    switch (reportType) {
      case 'monthly-income':
        data = await finReportsService.monthlyIncome(startDate, endDate, eventId);
        break;
      case 'monthly-expenses':
        data = await finReportsService.monthlyExpenses(startDate, endDate, eventId);
        break;
      case 'annual-summary':
        data = await finReportsService.annualSummary(startDate, endDate, eventId);
        break;
      case 'event-summary':
        data = await finReportsService.eventSummary(startDate, endDate);
        break;
      case 'receivables':
        data = await finReportsService.receivablesSummary();
        break;
      case 'payables':
        data = await finReportsService.payablesSummary();
        break;
      default:
        return errorResponse('Invalid reportType', 400);
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse('Failed to generate report', 500, error);
  }
}
