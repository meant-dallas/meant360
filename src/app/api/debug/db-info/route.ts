import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Temporary diagnostic route to identify which database a deployment is
// actually connected to at runtime, without ever exposing the credential
// itself. Admin-only. Remove once the Preview DB-connection issue is
// resolved.
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  let host = 'unset';
  try {
    const raw = process.env.DATABASE_URL || '';
    host = raw ? new URL(raw).host : 'unset';
  } catch {
    host = 'unparseable';
  }

  let eventCount: number | string = 'error';
  try {
    eventCount = await prisma.event.count();
  } catch (err) {
    eventCount = err instanceof Error ? `error: ${err.message}` : 'error';
  }

  return NextResponse.json({
    databaseHost: host,
    eventCount,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    vercelUrl: process.env.VERCEL_URL || null,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
