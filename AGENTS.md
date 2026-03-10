# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

MEANT360 — a membership and event management platform for nonprofit cultural associations. Handles member registration, event planning with check-in, financial tracking, sponsorship management, email communications, and PDF reporting through an admin dashboard and a self-service member portal.

## Build and Development Commands

- `npm run dev` — start Next.js dev server at http://localhost:3000
- `npm run build` — production build
- `npm run lint` — run ESLint (next/core-web-vitals)
- `npx prisma migrate deploy` — apply pending migrations
- `npx prisma migrate dev` — create + apply a new migration
- `npx prisma generate` — regenerate Prisma client after schema changes

There is no test suite configured in this project.

## Architecture

### Stack

Next.js 14 (App Router) with TypeScript, Tailwind CSS, Neon Postgres (serverless) via Prisma ORM, NextAuth.js (Google OAuth + Email OTP), Vercel Blob for file storage, Nodemailer/Gmail for email, jsPDF for PDF reports, Recharts for charts.

### Route Groups

- `src/app/(admin)/` — admin dashboard (members, events, finance, email, reports, settings)
- `src/app/(portal)/` — self-service portal for regular members

### Layered Backend

API routes delegate through three layers:

```
API Route (src/app/api/**/route.ts)
  → Service (src/services/*.service.ts)
    → Repository (src/repositories/*.repository.ts)
      → Prisma client (src/lib/db.ts)
```

Repositories wrap Prisma queries and normalize results via `toStringRecord()` (from `src/repositories/base.repository.ts`), keeping the service layer working with `Record<string, string>`. Services contain business logic. API routes handle auth, validate with Zod, call services, and return `{ success, data }` or `{ success, error }` via `jsonResponse()` / `errorResponse()` from `src/lib/api-helpers.ts`.

### API Route Pattern

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

### Auth and Roles

NextAuth configured in `src/lib/auth.ts`. Two providers: Google OAuth and Email OTP (credentials). Roles are database-driven via the `committee_members` table — not env vars:

- `admin` — full access
- `committee` — read + write, limited settings
- `member` — portal only (Email OTP login)
- Unknown users → access denied

Role is stored in the JWT token. Helpers: `isAdmin()`, `isAuthorized()`, `isMember()` exported from `src/lib/auth.ts`.

### Database

Neon Postgres via Prisma with `@prisma/adapter-neon`. Client generated into `src/generated/prisma/`. Import via `import { prisma } from '@/lib/db'`. The `DATABASE_URL` must be set in `.env.development.local` for Prisma CLI commands.

### Path Aliases

`@/*` maps to `./src/*`. Always use `@/` imports for project files.

### Key Conventions

- Monetary amounts stored as strings; parse with `parseAmount()` from `src/lib/utils.ts`
- Dates stored as ISO strings (`YYYY-MM-DD`)
- Zod schemas for API validation in `src/types/schemas.ts`
- All mutations are audit-logged via `src/lib/audit-log.ts`
- `scripts/` directory runs with `tsx` and is excluded from `tsconfig` compilation

### Adding a New Entity

1. Add Prisma model to `prisma/schema.prisma` → run `npx prisma migrate dev`
2. Create `src/repositories/<entity>.repository.ts`
3. Create `src/services/<entity>.service.ts`
4. Create `src/app/api/<entity>/route.ts` following the pattern above
5. Create `src/app/(admin)/<entity>/page.tsx`
6. Add a sidebar link in `src/components/layout/Sidebar.tsx`

### External Integrations

- **Square** (`src/lib/square.ts`): read-only, fetches completed orders
- **PayPal** (`src/lib/paypal.ts`): read-only, fetches transactions via Reporting API
- **Vercel Blob** (`src/lib/blob-storage.ts`): receipt and file uploads
- **Gmail SMTP** (`src/lib/email.ts`): outbound email via Nodemailer
- **PDF generation** (`src/lib/pdf.ts`): server-side using jsPDF + jspdf-autotable
