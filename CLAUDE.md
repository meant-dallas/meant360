# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals)

# Database
npx prisma migrate deploy      # Apply pending migrations
npx prisma migrate dev         # Create + apply a new migration
npx prisma generate            # Regenerate Prisma client (run after schema changes)
npx prisma studio              # Open Prisma Studio GUI

# Data scripts (run with tsx)
npm run db:import-excel        # Bulk import members from Excel
npm run db:migrate-members     # Migrate staging table to normalized schema
```

No test suite is configured.

## Environment Setup

- Copy `.env.example` to `.env.local` and fill in values
- `DATABASE_URL` must go in `.env.development.local` (not `.env.local`) for Prisma CLI commands to pick it up
- Required vars: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`

## Architecture

MEANT360 is a monolithic Next.js 14 (App Router) application with two distinct user-facing surfaces:

- **`(admin)` route group** — Admin dashboard for committee members (members, events, finance, email, reports)
- **`(portal)` route group** — Self-service portal for regular members

### Layered Backend Architecture

API routes delegate to a three-layer stack:

```
API Route (src/app/api/**/route.ts)
  → Service (src/services/*.service.ts)
    → Repository (src/repositories/*.repository.ts)
      → Prisma client (src/lib/db.ts)
```

- **Repositories** wrap Prisma queries and normalize results via `toStringRecord()` from `src/repositories/base.repository.ts`. This keeps the service layer working with `Record<string, string>` — the same contract as the old Google Sheets layer.
- **Services** contain business logic (pricing, audit logging, entity relationships).
- **API routes** handle auth, validate request bodies with Zod, call services, and return `{ success, data }` or `{ success, error }` via `jsonResponse()` / `errorResponse()` from `src/lib/api-helpers.ts`.

### API Route Pattern

Every API route follows this structure:

```ts
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(); // or requireAdmin(), requireMember()
  if (auth instanceof Response) return auth;

  try {
    const data = await someService.list();
    return jsonResponse(data);
  } catch (error) {
    return errorResponse('Failed', 500, error);
  }
}
```

Use `requireAuth()` for committee/admin access, `requireAdmin()` for admin-only, `requireMember()` for member portal routes.

### Auth and Roles

Configured in `src/lib/auth.ts`. Two providers: **Google OAuth** and **Email OTP** (credentials).

Roles are database-driven via the `committee_members` table — not env vars:
- `admin` — full access including settings and committee management
- `committee` — read + write access, limited settings
- `member` — portal only (Email OTP login)
- Unknown Google users → access denied

Role is stored in the JWT token. Auth helpers expose `isAdmin()`, `isAuthorized()`, `isMember()`.

### Database

Neon Postgres (serverless) via Prisma with `@prisma/adapter-neon`. The Prisma client is generated into `src/generated/prisma/` (not the default location). Import as:

```ts
import { prisma } from '@/lib/db';
```

The `neonConfig.fetchFunction` override in `src/lib/db.ts` disables Next.js fetch caching for all DB queries to prevent stale reads.

### Path Aliases

`@/*` maps to `./src/*`. Always use `@/` imports for project files.

### Key Conventions

- All monetary amounts in the database are stored as strings; use `parseAmount()` from `src/lib/utils.ts` to parse them
- Dates stored as ISO strings (`YYYY-MM-DD`)
- Zod schemas for API validation live in `src/types/schemas.ts`
- Activity logging for all mutations via `src/lib/audit-log.ts`
- The `scripts/` directory runs with `tsx` and is excluded from `tsconfig` compilation

### Adding a New Entity

1. Add Prisma model to `prisma/schema.prisma` → run `npx prisma migrate dev`
2. Create `src/repositories/<entity>.repository.ts`
3. Create `src/services/<entity>.service.ts`
4. Create `src/app/api/<entity>/route.ts` following the auth-check-then-service pattern
5. Create `src/app/(admin)/<entity>/page.tsx`
6. Add sidebar link in `src/components/layout/Sidebar.tsx`

### External Integrations

- **Square** (`src/lib/square.ts`) — read-only, fetches completed orders
- **PayPal** (`src/lib/paypal.ts`) — read-only, fetches transactions via Reporting API
- **Vercel Blob** (`src/lib/blob-storage.ts`) — receipt and file uploads
- **Nodemailer/Gmail SMTP** (`src/lib/email.ts`) — outbound email
- **PDF generation** (`src/lib/pdf.ts`) — server-side using jsPDF + jspdf-autotable

### CI

GitHub Actions on push/PR to `main` and `dev`: lint → build (with stub env vars; no real credentials needed for build).
