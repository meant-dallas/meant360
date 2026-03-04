import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ========================================
// Middleware: Auth, Rate Limiting, Security Headers
// ========================================

// --- Rate Limiting (in-memory, per-IP) ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// Cleanup stale entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  });
}, 5 * 60 * 1000);

// --- Security Headers ---

const securityHeaders: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://www.paypal.com https://www.sandbox.paypal.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://web.squarecdn.com https://sandbox.web.squarecdn.com",
    "img-src 'self' data: https: http: https://lh3.googleusercontent.com https://*.paypal.com https://www.google-analytics.com",
    "frame-src https://web.squarecdn.com https://sandbox.web.squarecdn.com https://www.paypal.com https://www.sandbox.paypal.com",
    "connect-src 'self' https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://web.squarecdn.com https://sandbox.web.squarecdn.com https://*.ingest.sentry.io https://www.paypal.com https://www.sandbox.paypal.com https://www.google-analytics.com https://analytics.google.com",
    "font-src 'self' https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net",
  ].join('; '),
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

// --- Public Allowlists ---

// API paths that do NOT require auth
const PUBLIC_API_PATHS = [
  '/api/auth',
  '/api/settings/public',
];

// API paths that are public but rate-limited
const RATE_LIMITED_API_PATHS = [
  '/api/events/', // public event detail, lookup, registrations, checkins, search
  '/api/payments',
];

// Page paths that do NOT require auth
const PUBLIC_PAGE_PREFIXES = [
  '/events/',
  '/auth/',
  '/_next/',
  '/favicon.ico',
];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicEventApiPath(pathname: string): boolean {
  // /api/events/[eventId] (GET only), /api/events/[eventId]/lookup, /api/events/[eventId]/registrations (POST),
  // /api/events/[eventId]/checkins (POST), /api/events/[eventId]/search
  return RATE_LIMITED_API_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicPagePath(pathname: string): boolean {
  return pathname === '/' || PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
}

// --- Middleware ---

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Rate limit public API endpoints
  if (isPublicEventApiPath(pathname)) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
      const response = NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
      return applySecurityHeaders(response);
    }
  }

  // 2. Auth check for API routes (deny-by-default)
  if (pathname.startsWith('/api/')) {
    // Allow public API paths
    if (isPublicApiPath(pathname)) {
      const response = NextResponse.next();
      return applySecurityHeaders(response);
    }

    // Public event API paths: specific methods are public
    // GET /api/events/[eventId] — public event detail
    // POST /api/events/[eventId]/lookup — public lookup
    // POST /api/events/[eventId]/registrations — public registration
    // POST /api/events/[eventId]/checkins — public checkin
    // POST /api/events/[eventId]/search — public search
    // POST /api/payments — public payment processing
    const eventApiMatch = pathname.match(/^\/api\/events\/[^/]+(\/(?:lookup|registrations|checkins|search))?$/);
    if (eventApiMatch) {
      const isEventDetailGet = !eventApiMatch[1] && request.method === 'GET';
      const isPublicSubRoute = !!eventApiMatch[1] && request.method === 'POST';
      if (isEventDetailGet || isPublicSubRoute) {
        const response = NextResponse.next();
        return applySecurityHeaders(response);
      }
    }

    if (pathname === '/api/payments' && request.method === 'POST') {
      const response = NextResponse.next();
      return applySecurityHeaders(response);
    }

    // All other API routes require auth
    const token = await getToken({ req: request });
    if (!token) {
      const response = NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
      return applySecurityHeaders(response);
    }

    const authResponse = NextResponse.next();
    return applySecurityHeaders(authResponse);
  }

  // 3. Auth check for admin pages (deny-by-default)
  if (!isPublicPagePath(pathname)) {
    const token = await getToken({ req: request });
    if (!token) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // 4. Apply security headers to all responses
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|logo\\.png|favicon-.*\\.png|apple-touch-icon\\.png).*)',
  ],
};
