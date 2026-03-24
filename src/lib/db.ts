import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';

// Disable Next.js fetch caching for all Neon HTTP queries.
// Without this, Next.js caches fetch() responses used by the Neon HTTP adapter,
// causing stale reads after writes.
// Also retry on Neon connection-limit errors (HTTP 500 with "Too many database connection attempts").
neonConfig.fetchFunction = async (url: string, init: RequestInit) => {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (res.ok || res.status !== 500) return res;

    const body = await res.text();
    if (!body.includes('Too many database connection attempts')) {
      return new Response(body, { status: res.status, headers: res.headers });
    }

    await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
  }
  return fetch(url, { ...init, cache: 'no-store' });
};

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaNeonHttp(connectionString, { fullResults: true });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
