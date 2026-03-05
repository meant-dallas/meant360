# MEANT360

A full-stack membership and event management platform built for nonprofit cultural associations. MEANT360 handles member registration, event planning with check-in, financial tracking, sponsorship management, email communications, and PDF reporting — all through a modern admin dashboard and a self-service member portal.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Role-Based Access](#role-based-access)
- [Security](#security)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **UI** | [React 18](https://react.dev/), [Tailwind CSS 3](https://tailwindcss.com/) |
| **Database** | [Neon Postgres](https://neon.tech/) (serverless PostgreSQL) |
| **ORM** | [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-neon` |
| **Auth** | [NextAuth.js 4](https://next-auth.js.org/) — Google OAuth + Email OTP |
| **File Storage** | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) |
| **Email** | [Nodemailer](https://nodemailer.com/) via Gmail SMTP |
| **Rich Text Editor** | [Tiptap](https://tiptap.dev/) |
| **Charts** | [Recharts](https://recharts.org/) |
| **PDF Generation** | [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable |
| **CSV Parsing** | [PapaParse](https://www.papaparse.com/) |
| **QR Codes** | [react-qr-code](https://github.com/rosskhanas/react-qr-code) |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) |
| **Validation** | [Zod](https://zod.dev/) |
| **Error Monitoring** | [Sentry](https://sentry.io/) |
| **Analytics** | Google Analytics 4 |
| **Payment Sync** | [Square API](https://developer.squareup.com/), PayPal REST API |
| **Hosting** | [Vercel](https://vercel.com/) |
| **CI** | [GitHub Actions](https://github.com/features/actions) — lint + build on push/PR |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Client (Browser)                          │
│          Next.js App Router  ·  React 18  ·  Tailwind CSS    │
├──────────────────────────────────────────────────────────────┤
│                   Next.js API Routes                          │
│  Auth · Members · Events · Finance · Email · Reports · Portal│
├──────────┬──────────────┬──────────────┬─────────────────────┤
│  NextAuth│  Neon Postgres│ Vercel Blob  │  External APIs      │
│  (OAuth +│  via Prisma   │ (Receipts /  │  Square · PayPal    │
│  Email   │  ORM          │  Uploads)    │  Gmail SMTP         │
│  OTP)    │               │              │  Sentry · GA4       │
└──────────┴──────────────┴──────────────┴─────────────────────┘
```

The application is a monolithic Next.js deployment — frontend and backend in a single codebase. The admin dashboard and member portal are split via Next.js route groups (`(admin)` and `(portal)`), each with its own layout.

---

## Features

### Admin Dashboard
| Module | Description |
|--------|-------------|
| **Dashboard** | YTD income/expenses, net surplus/deficit, monthly trend chart, event summaries |
| **Members** | Full member directory with family details (spouse, children), address, membership history, and payment records |
| **Guests** | Track guest attendance and referral sources |
| **Event Management** | Create events with configurable pricing rules, activities, registration forms, guest policies; manage registrations and check-ins |
| **Finance — Income** | Track membership dues, guest fees, event entry, donations by payment method |
| **Finance — Expenses** | General and event expenses with receipt uploads, built-in reimbursement workflow (request → approve → reimburse) |
| **Finance — Transactions** | Sync from Square and PayPal, deduplicate by external ID, tag and categorize |
| **Sponsors** | Annual and event-specific sponsorships with paid/pending tracking |
| **Reports** | Generate event, monthly, and annual reports in PDF and CSV |
| **Email** | Compose and send emails using a rich text editor (Tiptap), manage reusable templates, view send history |
| **Membership Applications** | Review, multi-approve, or reject online applications |
| **Settings** | Manage committee members, app configuration |
| **Activity Log** | Audit trail of all data changes with before/after values |

### Member Portal
| Module | Description |
|--------|-------------|
| **Portal Home** | Member-facing dashboard |
| **Profile** | View and update personal profile |
| **Events** | Browse upcoming events |

---

## Database Schema

The application uses **Neon Postgres** with **Prisma ORM**. Below is every model defined in `prisma/schema.prisma`.

### Core Models

#### Member
Primary member record with personal info, education, employment, and membership status.

| Column | Type | Description |
|--------|------|-------------|
| id | String (cuid) | Primary key |
| firstName, middleName, lastName | String | Full name |
| email | String | Primary email |
| phone, homePhone, cellPhone | String | Phone numbers |
| qualifyingDegree | String | Educational degree |
| nativePlace | String | Place of origin |
| college | String | College attended |
| jobTitle, employer | String | Employment details |
| specialInterests | String | Hobbies and interests |
| membershipType | String | Yearly (default) or Life |
| membershipLevel | String | Membership tier |
| registrationDate, renewalDate | String | Membership dates |
| status | String | Active, Inactive, etc. |
| loginEmail | String | Email used for portal login |

**Relations:** addresses, spouses, children, memberships (yearly status), payments, sponsors, event participations

#### MemberAddress
| Column | Type | Description |
|--------|------|-------------|
| street, street2, city, state, zipCode, country | String | Full mailing address |
| memberId | String | FK → Member |

#### MemberSpouse
| Column | Type | Description |
|--------|------|-------------|
| firstName, middleName, lastName | String | Spouse name |
| email, phone | String | Contact info |
| nativePlace, company, college, qualifyingDegree | String | Background details |
| memberId | String | FK → Member |

#### MemberChild
| Column | Type | Description |
|--------|------|-------------|
| name, sex, grade, age, dateOfBirth | String | Child info |
| sortOrder | Int | Display order |
| memberId | String | FK → Member |

#### MemberMembership
Tracks year-by-year membership status for each member.

| Column | Type | Description |
|--------|------|-------------|
| memberId | String | FK → Member |
| year | String | Membership year |
| status | String | Paid, Pending, etc. |

**Unique constraint:** (memberId, year)

#### MemberPayment
| Column | Type | Description |
|--------|------|-------------|
| memberId | String | FK → Member |
| product, amount, currency | String | Payment details |
| payerName, payerEmail | String | Payer info |
| transactionId | String | External payment reference |

#### MemberSponsor
| Column | Type | Description |
|--------|------|-------------|
| memberId | String | FK → Member |
| name, email, phone | String | Sponsor contact info |

### Event Models

#### Event
| Column | Type | Description |
|--------|------|-------------|
| id | String (cuid) | Primary key |
| name, date, description | String | Event basics |
| status | String | Upcoming, Completed, Cancelled |
| category | String | Event category |
| parentEventId | String | For sub-events |
| pricingRules | Json | Configurable pricing tiers |
| formConfig | Json | Custom registration form fields |
| activities | Json | Activity list for the event |
| activityPricingMode | String | Pricing mode for activities |
| guestPolicy | Json | Guest admission rules |
| registrationOpen | String | Whether registration is open |

**Relations:** participants, income, expenses, sponsors

#### EventParticipant
| Column | Type | Description |
|--------|------|-------------|
| eventId | String | FK → Event |
| type | String | Member or Guest |
| memberId / guestId | String? | FK → Member or Guest |
| name, email, phone | String | Participant contact |
| registeredAdults, registeredKids | String | Registration counts |
| actualAdults, actualKids | String | Check-in counts |
| registeredAt, checkedInAt | String | Timestamps |
| selectedActivities | Json | Chosen activities |
| customFields | Json | Custom form responses |
| totalPrice | String | Calculated total |
| priceBreakdown | Json | Itemized pricing |
| paymentStatus, paymentMethod, transactionId | String | Payment info |

### Finance Models

#### Income
| Column | Type | Description |
|--------|------|-------------|
| incomeType | String | Membership, Guest Fee, Event Entry, Donation, Other |
| eventName / eventId | String | Associated event |
| amount | Float | Dollar amount |
| date | String | Income date |
| paymentMethod | String | Cash, Check, Square, PayPal, Zelle, Bank Transfer |
| payerName | String | Name of payer |

#### Expense
| Column | Type | Description |
|--------|------|-------------|
| expenseType | String | General or Event |
| eventName / eventId | String | Associated event |
| category | String | Admin, Venue, Catering, Miscellaneous, etc. |
| description | String | What was purchased |
| amount | Float | Dollar amount |
| paidBy | String | Organization or individual |
| receiptUrl, receiptFileId | String | Uploaded receipt reference |
| needsReimbursement | String | Flag for reimbursement |
| reimbStatus | String | Pending, Approved, Reimbursed, Rejected |
| reimbMethod, reimbAmount, approvedBy, approvedDate, reimbursedDate | String/Float | Reimbursement workflow fields |

#### Sponsor
| Column | Type | Description |
|--------|------|-------------|
| name, email, phone | String | Sponsor contact |
| type | String | Annual or Event |
| amount | Float | Sponsorship amount |
| eventName / eventId | String | Associated event (if event type) |
| year | String | Sponsorship year |
| paymentMethod, paymentDate | String | Payment details |
| status | String | Paid or Pending |

#### Transaction
| Column | Type | Description |
|--------|------|-------------|
| externalId | String | Square/PayPal transaction ID (for dedup) |
| source | String | Square, PayPal, or Manual |
| amount, fee, netAmount | Float | Financial amounts |
| description | String | Transaction description |
| payerName, payerEmail | String | Payer details |
| tag | String | Membership, Guest Fee, Sponsorship, etc. |
| eventName | String | Associated event |
| syncedAt | String | When imported |

### System Models

#### Guest
| Column | Type | Description |
|--------|------|-------------|
| name, email, phone, city | String | Guest contact info |
| referredBy | String | Who referred this guest |
| eventsAttended | Int | Total events attended |
| lastEventDate | String | Most recent event |

#### CommitteeMember
Controls role-based access — stored in the database, not env vars.

| Column | Type | Description |
|--------|------|-------------|
| email | String | Primary key |
| name | String | Display name |
| designation | String | Title (e.g., President, Treasurer) |
| role | String | admin, treasurer, viewer |

#### MembershipApplication
| Column | Type | Description |
|--------|------|-------------|
| status | String | Pending, Approved, Rejected |
| (member fields) | String | Same as Member model |
| address, spouse, children | Json | Nested family info |
| membershipType | String | Yearly or Life |
| amountPaid, paymentMethod, transactionId, paymentStatus | String | Payment info |
| approvals | Json | Multi-approver tracking |
| approvalCount | Int | Number of approvals received |
| rejectedBy, rejectedReason | String | Rejection info |
| memberId | String | Created Member ID after approval |

#### EmailTemplate
| Column | Type | Description |
|--------|------|-------------|
| name, subject | String | Template name and subject line |
| body | Text | HTML body content |

#### SentEmail
| Column | Type | Description |
|--------|------|-------------|
| to, subject, body | String | Email content |
| provider | String | SMTP provider used |
| status | String | Sent, Failed |
| error | Text? | Error message if failed |
| sentBy | String | Admin who sent it |

#### LoginToken
| Column | Type | Description |
|--------|------|-------------|
| email | String | Recipient email |
| token | String | OTP code |
| expiresAt | DateTime | Expiry timestamp |
| used | Boolean | Whether token was consumed |

#### ActivityLog
| Column | Type | Description |
|--------|------|-------------|
| userEmail | String | Who performed the action |
| action | String | CREATE, UPDATE, DELETE |
| entityType, entityId, entityLabel | String | What was changed |
| description | String | Human-readable summary |
| changedFields, oldValues, newValues | Json | Detailed diff |

#### Setting
| Column | Type | Description |
|--------|------|-------------|
| key | String | Setting key (primary key) |
| value | String | Setting value |
| updatedBy | String | Last editor |

#### RawMemberImport
Staging table for bulk Excel imports. Contains flat columns for member, spouse, children (up to 4), sponsor, yearly membership statuses, and PayPal payment info. Rows are migrated into the normalized Member model via migration scripts.

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| * | `/api/auth/[...nextauth]` | NextAuth — Google OAuth + credentials |
| POST | `/api/auth/email` | Send email OTP / verify OTP |

### Members & Guests
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/api/members` | Member CRUD |
| GET/POST/PUT/DELETE | `/api/members/guests` | Guest CRUD |

### Membership Applications
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/membership-applications` | Submit application |
| GET | `/api/membership-applications/list` | List all applications |
| PUT/DELETE | `/api/membership-applications/[id]` | Approve/reject/delete |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/api/events` | Event CRUD |
| GET/PUT/DELETE | `/api/events/[eventId]` | Single event operations |
| GET/POST/PUT/DELETE | `/api/events/[eventId]/registrations` | Manage registrations |
| POST | `/api/events/[eventId]/checkins` | Check in participants |
| GET | `/api/events/[eventId]/stats` | Event statistics |
| GET | `/api/events/[eventId]/search` | Search participants |
| GET | `/api/events/[eventId]/lookup` | Lookup member/guest |

### Finance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/api/finance/income` | Income CRUD |
| GET/POST/PUT/DELETE | `/api/finance/expenses` | Expenses CRUD |
| GET/POST/PUT | `/api/finance/transactions` | Transactions + sync |
| GET/POST/PUT/DELETE | `/api/sponsors` | Sponsor CRUD |
| GET/POST | `/api/payments` | Payment records |

### Email
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/send` | Send email |
| GET | `/api/email/recipients` | Get recipient list |
| GET/POST/PUT/DELETE | `/api/email/templates` | Email templates CRUD |
| GET | `/api/email/history` | Sent email history |

### Dashboard & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Dashboard summary data |
| GET | `/api/reports` | Generate PDF/CSV reports |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/api/committee` | Committee member management |
| GET/PUT | `/api/settings` | App settings |
| GET | `/api/settings/public` | Public settings |
| GET | `/api/activity-log` | Audit log |
| POST | `/api/upload` | Upload file to Vercel Blob |

### Member Portal
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portal/dashboard` | Portal dashboard data |
| GET/PUT | `/api/portal/profile` | Member profile |
| GET | `/api/portal/events` | Portal event list |

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma              # Database schema (20+ models)
│   └── migrations/                # SQL migration files
├── scripts/                       # Data import and migration utilities
│   ├── import-excel-members.ts    # Bulk import from Excel
│   ├── migrate-staging-to-normalized.ts
│   └── ...
├── src/
│   ├── app/
│   │   ├── (admin)/               # Admin dashboard pages
│   │   │   ├── dashboard/
│   │   │   ├── members/
│   │   │   ├── guests/
│   │   │   ├── event-management/
│   │   │   ├── finance/           # income, expenses, transactions
│   │   │   ├── sponsors/
│   │   │   ├── reports/
│   │   │   ├── email/             # compose, templates
│   │   │   ├── membership-applications/
│   │   │   ├── settings/
│   │   │   └── layout.tsx         # Admin shell with sidebar
│   │   ├── (portal)/              # Member self-service portal
│   │   │   ├── portal/
│   │   │   └── layout.tsx         # Portal layout
│   │   └── api/                   # API route handlers (33 routes)
│   ├── components/
│   │   ├── layout/                # AppShell, Sidebar, Providers
│   │   ├── charts/                # Recharts dashboard components
│   │   └── ui/                    # Modal, DataTable, Toast, etc.
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (Google + Email OTP)
│   │   ├── db.ts                  # Prisma client (Neon serverless)
│   │   ├── api-helpers.ts         # API route utilities
│   │   ├── audit-log.ts           # Activity logging
│   │   ├── blob-storage.ts        # Vercel Blob uploads
│   │   ├── security.ts            # Request validation
│   │   ├── validation.ts          # Zod schemas
│   │   ├── pricing.ts             # Event pricing calculations
│   │   ├── event-config.ts        # Event configuration logic
│   │   ├── pdf.ts                 # PDF report generation
│   │   ├── square.ts              # Square API integration
│   │   ├── paypal.ts              # PayPal API integration
│   │   ├── analytics.ts           # GA4 tracking
│   │   └── utils.ts               # Shared utilities
│   ├── hooks/                     # React hooks
│   └── types/                     # TypeScript type definitions
├── sentry.*.config.ts             # Sentry configuration
├── next.config.js                 # Next.js config with Sentry + security headers
├── .github/workflows/ci.yml       # CI pipeline (lint + build)
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech/) Postgres database (free tier available)
- A Google Cloud project with OAuth credentials
- (Optional) Square and/or PayPal developer accounts

### 1. Clone and Install

```bash
git clone <repository-url>
cd meant360
npm install
```

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Create **OAuth 2.0 credentials**:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
   - Save the **Client ID** and **Client Secret**

### 3. Database Setup

1. Create a Neon project at [neon.tech](https://neon.tech/)
2. Copy the connection string
3. Create `.env.development.local`:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

### 4. Environment Variables

```bash
cp .env.example .env.local
```

Fill in all required values (see [Environment Variables](#environment-variables) below).

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with Google.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string (set in `.env.development.local`) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXTAUTH_URL` | Yes | App URL (e.g., `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | Random secret — generate with `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob token for file uploads |
| `SMTP_GMAIL_USER` | No | Gmail address for sending emails |
| `SMTP_GMAIL_PASS` | No | Gmail app password |
| `SQUARE_ACCESS_TOKEN` | No | Square API token |
| `SQUARE_ENVIRONMENT` | No | `sandbox` or `production` |
| `SQUARE_LOCATION_ID` | No | Square location ID |
| `PAYPAL_CLIENT_ID` | No | PayPal REST API client ID |
| `PAYPAL_CLIENT_SECRET` | No | PayPal REST API secret |
| `PAYPAL_ENVIRONMENT` | No | `sandbox` or `production` |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error monitoring |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source maps |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Google Analytics 4 measurement ID |

Database URLs are managed per-environment:
- `.env.development.local` — local dev and Prisma CLI
- `.env.production.local` — local production builds
- Vercel dashboard — production deployment

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import the repository at [vercel.com](https://vercel.com)
3. Add all environment variables
4. Update `NEXTAUTH_URL` to your Vercel domain
5. Update Google OAuth redirect URI to `https://your-app.vercel.app/api/auth/callback/google`
6. Deploy

### CI Pipeline

GitHub Actions runs on every push and PR to `main` and `dev`:
- **Lint** — `next lint`
- **Build** — `next build` (with stub env vars)

---

## Role-Based Access

Roles are managed via the `committee_members` database table (not env vars).

| Role | View | Create/Edit | Delete | Settings | Committee |
|------|------|-------------|--------|----------|-----------|
| **Admin** | All | All | All | All | Manage |
| **Treasurer** | All | All | All | Limited | View |
| **Viewer** | All | None | None | None | None |

Committee members are added through the Settings page by an admin. Any authenticated Google user not in the committee table gets `viewer` role.

Members can also log in via **Email OTP** to access the member portal.

---

## Security

- All API routes validate authentication via NextAuth session
- Write operations require `admin` or `treasurer` role
- Database credentials are never exposed to the browser (server-side only)
- File uploads validated for type and size
- Security headers configured: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`
- Square/PayPal tokens stored server-side only
- Email OTP tokens are single-use with expiry
- Activity log records all data mutations with before/after values
- Sentry error monitoring with source map uploads
