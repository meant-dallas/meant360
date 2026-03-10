import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { listTerminalDevices } from '@/lib/square';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const devices = await listTerminalDevices();
    return jsonResponse(devices);
  } catch (error) {
    console.error('GET /api/payments/terminal-devices error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list terminal devices';
    return errorResponse(message, 500, error);
  }
}
