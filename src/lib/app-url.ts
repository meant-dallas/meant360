import { headers } from 'next/headers';

/**
 * Get the application base URL dynamically from the incoming request headers.
 * Works in Server Components, Route Handlers, and Server Actions.
 *
 * Fallback order:
 * 1. Request headers (host + x-forwarded-proto)
 * 2. NEXTAUTH_URL env var
 * 3. VERCEL_PROJECT_PRODUCTION_URL env var (auto-set by Vercel)
 * 4. VERCEL_URL env var (auto-set by Vercel, preview deploys)
 * 5. localhost:3000
 */
export function getAppUrl(): string {
  try {
    const h = headers();
    const host = h.get('host');
    if (host) {
      const proto = h.get('x-forwarded-proto') || 'https';
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside of request context — fall through to env vars
  }

  if (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL !== 'http://localhost:3000') {
    return process.env.NEXTAUTH_URL;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}
