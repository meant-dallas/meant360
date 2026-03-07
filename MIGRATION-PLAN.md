# Service Account Migration Plan

Migrate all external services to a new email address while keeping the current GitHub repository.

**Organization Email:** `___________@meant.org` (or other non-Gmail — used for account ownership)
**Gmail for SMTP:** `___________@gmail.com` (needed only for sending emails via Gmail SMTP)
**Current Hosting:** Vercel (linked to GitHub repo `meantdallas`)

> **Important:** Most services below (Google Cloud, Vercel, Neon, Square, PayPal, Sentry) accept **any email address** for account signup — a Gmail account is NOT required. Use your organization email (e.g., `admin@meant.org`) as the owner for all services. A separate Gmail is only needed for the SMTP email sending feature (Section 7).

---

## Table of Contents

1. [Pre-Migration Checklist](#1-pre-migration-checklist)
2. [Google Cloud Console (OAuth + Analytics)](#2-google-cloud-console)
3. [Neon PostgreSQL (Database)](#3-neon-postgresql-database)
4. [Vercel (Hosting + Blob Storage)](#4-vercel-hosting--blob-storage)
5. [Square (Payments)](#5-square-payments)
6. [PayPal (Payments)](#6-paypal-payments)
7. [Gmail SMTP (Email)](#7-gmail-smtp-email)
8. [Sentry (Error Monitoring)](#8-sentry-error-monitoring)
9. [Update Environment Variables](#9-update-environment-variables)
10. [Database Migration (Critical)](#10-database-migration-critical)
11. [Vercel Redeployment](#11-vercel-redeployment)
12. [Post-Migration Verification](#12-post-migration-verification)

---

## 1. Pre-Migration Checklist

- [ ] Decide on your organization email (e.g., `admin@meant.org`) for service ownership
- [ ] Create a Gmail account for SMTP email sending (only if you don't already have one)
- [ ] Enable 2FA on both accounts
- [ ] Export/backup the current production database (see Section 10)
- [ ] Document all current env var values from `.env.local`, `.env.development.local`, `.env.production.local`
- [ ] Keep old accounts active until migration is fully verified

---

## 2. Google Cloud Console

Google Cloud provides 2 services: **OAuth login** and **Analytics**.

### 2a. Create New Google Cloud Project

1. Go to https://console.cloud.google.com
2. Sign in with your **organization email**
   - Google Cloud accepts any email. If your org email isn't a Google account yet, click "Create account" > "Use my current email address instead" > enter your non-Gmail address and follow the prompts to create a Google account linked to it.
3. Click "Select a project" > "New Project"
4. Name: `meant-portal` (or similar)
5. Note the **Project ID**

### 2b. Google OAuth (User Login)

1. In the new project, go to **APIs & Services > OAuth consent screen**
2. Choose "External" user type
3. Fill in app name: `MEANT Portal`, support email: organization email
4. Add authorized domains: `meant.org`, `www.meant.org`
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth client ID**
7. Application type: **Web application**
8. Name: `MEANT Portal`
9. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://www.meant.org/api/auth/callback/google` (prod)
10. Copy the **Client ID** and **Client Secret**

**Env vars to update:**
```
GOOGLE_CLIENT_ID=<new-client-id>
GOOGLE_CLIENT_SECRET=<new-client-secret>
```

**Files that reference this:**
- `.env.local` (lines 6-7)
- Vercel dashboard environment variables

### 2c. Google Analytics 4

1. Go to https://analytics.google.com
2. Sign in with your **organization email** (same Google account from 2a)
3. Create a new GA4 property or transfer the existing one:
   - **Option A (New property):** Admin > Create Property > set up data stream for your domain
   - **Option B (Transfer):** In old account, Admin > Property Access Management > add organization email as Admin, then remove old
4. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)

**Env vars to update:**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=<new-measurement-id>
```

**Files that reference this:**
- `.env.local` (line 42)
- `src/components/analytics/GoogleAnalytics.tsx`
- `src/lib/analytics.ts`

---

## 3. Neon PostgreSQL (Database)

**THIS IS THE MOST CRITICAL STEP. Do database migration carefully.**

### 3a. Create New Neon Account & Project

1. Go to https://console.neon.tech
2. Sign up with your **organization email** (accepts any email)
3. Create a new project:
   - Name: `meant-portal`
   - Region: `us-east-1` (same as current for low latency)
   - Postgres version: same as current
4. The default branch is `main` (production)
5. Create a second branch named `dev` (for development)
   - Branches > Create Branch > parent: `main`, name: `dev`

### 3b. Note Connection Strings

From the Neon dashboard, copy for **each branch**:

**Main branch (production):**
```
DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
```

**Dev branch:**
```
DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://<user>:<pass>@<host>.<region>.aws.neon.tech/neondb?sslmode=require
```

**Files to update:**
- `.env.development.local` — dev branch pooler + unpooled URLs
- `.env.production.local` — main branch pooler URL
- Vercel dashboard — production and preview env vars

### 3c. Migrate Schema & Data

See [Section 10](#10-database-migration-critical) for the full database migration procedure.

---

## 4. Vercel (Hosting + Blob Storage)

### 4a. Create Vercel Organization

1. Sign up at https://vercel.com with your **organization email** (accepts any email)
2. Go to **Settings > Team** (or create a new team during signup)
3. Click **Create Team** to set up an organization
   - Name: `MEANT Dallas` (or similar)
   - Plan: Hobby (free) or Pro as needed
4. Connect your **GitHub account** (same repo: `meantdallas`)
5. Import the project into the new org

### 4b. Add Members to Vercel Org

1. Go to **Settings > Members**
2. Click **Invite Member** for each committee member who needs access
3. Set roles appropriately:

| Role | Access | Who |
|------|--------|-----|
| **Owner** | Full access, billing, members | Organization admin (org email) |
| **Member** | Deploy, view projects, env vars | Committee members / developers |
| **Viewer** | Read-only access to deployments | Other stakeholders |

4. Each invited member will receive an email to accept the invitation
5. Once accepted, they can access the project dashboard

**Member emails to invite:**
- [ ] `___________@gmail.com` (Owner)
- [ ] `___________@gmail.com` (Member)
- [ ] `___________@gmail.com` (Member)
- [ ] _(add more as needed)_

### 4c. Configure Project in New Org

1. In the org dashboard, go to the imported project
2. **Settings > General** — verify the GitHub repo is connected
3. **Settings > Git** — confirm branch deployments:
   - Production branch: `main`
   - Preview branches: `dev` and feature branches
4. **Settings > Environment Variables** — add all env vars (see Section 9)

### 4d. Custom Domain Setup (`www.meant.org`)

#### Step 1: Add Domain in Vercel

1. Go to project **Settings > Domains**
2. Add `www.meant.org`
3. Add `meant.org` (root/apex domain)
4. Set `www.meant.org` as the **primary** domain
5. Vercel will show DNS records you need to configure

#### Step 2: Configure DNS at Your Domain Registrar

Log in to your domain registrar (wherever `meant.org` is registered) and update DNS records:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| `CNAME` | `www` | `cname.vercel-dns.com` | Points www.meant.org to Vercel |
| `A` | `@` | `76.76.21.21` | Points meant.org (apex) to Vercel |

> **Note:** Some registrars don't support `CNAME` on the apex domain. If so, use Vercel's `A` record (`76.76.21.21`) for the `@` record. If your registrar supports `ALIAS` or `ANAME` records, use `cname.vercel-dns.com` instead.

#### Step 3: Configure Redirect (Root to WWW)

In Vercel **Settings > Domains**, set up a redirect:
- `meant.org` → redirects to `www.meant.org` (308 permanent redirect)
- This ensures all traffic goes to the `www` version

#### Step 4: SSL Certificate

- Vercel automatically provisions a free SSL certificate via Let's Encrypt
- After DNS propagates (can take up to 48 hours, usually minutes), Vercel will issue the cert
- Verify by visiting `https://www.meant.org` — should show a valid HTTPS connection

#### Step 5: Update App Configuration

After the domain is live, update these references:

1. **Google OAuth redirect URIs** (Section 2b):
   - Add `https://www.meant.org/api/auth/callback/google`
2. **Environment variable:**
   ```
   NEXTAUTH_URL=https://www.meant.org
   ```
3. **Square payment settings** — if using production, update the allowed domain in Square Developer Dashboard
4. **PayPal payment settings** — update return URLs in PayPal Developer Dashboard if configured
5. **Google Analytics** — update the data stream URL to `www.meant.org`

#### Step 6: Verify Domain is Working

- [ ] `https://www.meant.org` loads the app
- [ ] `https://meant.org` redirects to `https://www.meant.org`
- [ ] `http://www.meant.org` redirects to `https://www.meant.org`
- [ ] Google OAuth login works with the new domain
- [ ] Payment flows work with the new domain (test in sandbox first)
- [ ] Emails contain the correct `www.meant.org` URLs

### 4e. Blob Storage (New Token)

1. In Vercel org dashboard > **Storage > Blob**
2. Create a new Blob store (linked to the project)
3. Copy the new `BLOB_READ_WRITE_TOKEN`

**Env vars to update:**
```
BLOB_READ_WRITE_TOKEN=<new-token>
```

**Files that reference this:**
- `.env.local`
- `src/lib/blob-storage.ts`

**Important:** Existing uploaded files (receipts, logos) in the old Blob store will NOT transfer. You'll need to re-upload them or copy them programmatically.

---

## 5. Square (Payments)

### 5a. Create New Square Developer Account

1. Go to https://developer.squareup.com
2. Sign up with your **organization email** (accepts any email)
3. Create a new application
   - Name: `MEANT Portal`

### 5b. Sandbox Credentials (Development)

1. In Square Developer dashboard > your app > Credentials
2. Switch to **Sandbox** tab
3. Copy:
   - Sandbox Access Token
   - Sandbox Application ID
   - Sandbox Location ID (from Locations tab)

### 5c. Production Credentials (When Ready)

1. Switch to **Production** tab
2. Copy:
   - Production Access Token
   - Production Application ID
   - Production Location ID

**Env vars to update:**
```
# Server-side
SQUARE_ACCESS_TOKEN=<new-access-token>
SQUARE_ENVIRONMENT=sandbox        # change to 'production' when ready
SQUARE_LOCATION_ID=<new-location-id>

# Client-side
NEXT_PUBLIC_SQUARE_APP_ID=<new-app-id>
NEXT_PUBLIC_SQUARE_LOCATION_ID=<new-location-id>
```

**Files that reference this:**
- `.env.local` (lines 26-28, 37-38)
- `src/lib/square.ts`
- `src/services/payments.service.ts`
- `src/middleware.ts` (CSP headers)

**Note:** Transaction history from the old Square account will NOT be accessible from the new account. If you need historical data, export it from the old account first.

---

## 6. PayPal (Payments)

### 6a. Create New PayPal Developer Account

1. Go to https://developer.paypal.com
2. Sign up/log in with your **organization email** (requires a PayPal account — create one with your org email)
3. Go to **Apps & Credentials**
4. Click **Create App**
   - Name: `MEANT Portal`
   - Type: Merchant

### 6b. Sandbox Credentials

1. In the app, switch to **Sandbox** mode
2. Copy **Client ID** and **Secret**

### 6c. Production Credentials (When Ready)

1. Switch to **Live** mode
2. Copy **Client ID** and **Secret**

**Env vars to update:**
```
# Server-side
PAYPAL_CLIENT_ID=<new-client-id>
PAYPAL_CLIENT_SECRET=<new-client-secret>
PAYPAL_ENVIRONMENT=sandbox         # change to 'production' when ready

# Client-side
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<new-client-id>
```

**Files that reference this:**
- `.env.local` (lines 31-33, 39)
- `src/lib/paypal.ts`
- `src/services/payments.service.ts`
- `src/middleware.ts` (CSP headers)

---

## 7. Gmail SMTP (Email)

> **This is the only service that requires a Gmail account.** All other services use the organization email.

### 7a. Set Up App Password on Gmail

1. Sign in to your **Gmail account** (separate from your organization email)
2. Go to https://myaccount.google.com/security
3. Ensure **2-Step Verification** is enabled
4. Go to https://myaccount.google.com/apppasswords
5. Create a new app password:
   - App: "Mail"
   - Device: "Other" > name it "MEANT Portal"
6. Copy the 16-character app password

**Env vars to update:**
```
SMTP_GMAIL_USER=<new-email>@gmail.com
SMTP_GMAIL_PASS=<new-16-char-app-password>
```

**Files that reference this:**
- `.env.local` (lines 55-56)
- `src/services/email.service.ts`

**Important:** Email sender address will change. Update any email templates that reference the old sender address. Also notify members that emails will now come from the new address.

---

## 8. Sentry (Error Monitoring)

### 8a. Create New Sentry Account

1. Go to https://sentry.io
2. Sign up with the **new email**
3. Create a new organization (e.g., `meantdallas`)
4. Create a new project:
   - Platform: **Next.js**
   - Name: `meant-portal`
5. Copy the **DSN** from Project Settings > Client Keys

### 8b. Auth Token (for source map uploads)

1. Go to Settings > Auth Tokens
2. Create a new token with `project:releases` and `org:read` scopes
3. Copy the token

**Env vars to update:**
```
NEXT_PUBLIC_SENTRY_DSN=<new-dsn>
SENTRY_ORG=<new-org-slug>
SENTRY_PROJECT=<new-project-slug>
SENTRY_AUTH_TOKEN=<new-auth-token>
```

**Files that reference this:**
- `.env.local`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `next.config.js` (lines 24-30)

---

## 9. Update Environment Variables

### Summary of ALL Env Vars to Update

#### `.env.local` (shared dev/prod secrets)

| Variable | Service | Action |
|----------|---------|--------|
| `GOOGLE_CLIENT_ID` | Google OAuth | Replace |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Replace |
| `NEXTAUTH_URL` | NextAuth | Set to `https://www.meant.org` |
| `NEXTAUTH_SECRET` | NextAuth | Regenerate* |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Replace |
| `SQUARE_ACCESS_TOKEN` | Square | Replace |
| `SQUARE_ENVIRONMENT` | Square | Keep `sandbox` |
| `SQUARE_LOCATION_ID` | Square | Replace |
| `PAYPAL_CLIENT_ID` | PayPal | Replace |
| `PAYPAL_CLIENT_SECRET` | PayPal | Replace |
| `PAYPAL_ENVIRONMENT` | PayPal | Keep `sandbox` |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | App config | Keep `true` |
| `NEXT_PUBLIC_SQUARE_APP_ID` | Square | Replace |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Square | Replace |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | PayPal | Replace |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics | Replace |
| `SMTP_GMAIL_USER` | Gmail SMTP | Replace |
| `SMTP_GMAIL_PASS` | Gmail SMTP | Replace |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Replace |
| `SENTRY_ORG` | Sentry | Replace |
| `SENTRY_PROJECT` | Sentry | Replace |
| `SENTRY_AUTH_TOKEN` | Sentry | Replace |

*To regenerate NEXTAUTH_SECRET: run `openssl rand -base64 32`

#### `.env.development.local`

| Variable | Action |
|----------|--------|
| `DATABASE_URL` | Replace with new Neon dev branch pooler URL |
| `DATABASE_URL_UNPOOLED` | Replace with new Neon dev branch unpooled URL |

#### `.env.production.local`

| Variable | Action |
|----------|--------|
| `DATABASE_URL` | Replace with new Neon main branch pooler URL |

#### Vercel Dashboard Environment Variables

Replicate ALL the above variables in Vercel:
1. Go to Vercel project > Settings > Environment Variables
2. Update each variable for the appropriate environment (Production, Preview, Development)
3. **Critical:** Set `DATABASE_URL` per environment:
   - Production: Neon main branch URL
   - Preview: Neon dev branch URL

---

## 10. Database Migration (Critical)

This is the most important step. Follow carefully.

### 10a. Export Data from Old Database

```bash
# Export the entire old production database
pg_dump "postgresql://neondb_owner:npg_2BucPTM0Qdgt@ep-flat-forest-aif7opl9-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  --data-only \
  --no-owner \
  --no-privileges \
  -f old-db-data-backup.sql

# Also export schema for reference
pg_dump "postgresql://neondb_owner:npg_2BucPTM0Qdgt@ep-flat-forest-aif7opl9-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  --schema-only \
  --no-owner \
  --no-privileges \
  -f old-db-schema-backup.sql
```

### 10b. Apply Schema to New Database

```bash
# Point Prisma at the new database (update .env.development.local first with new URLs)
# Then push the schema
npx prisma migrate deploy

# Or if starting fresh with no migration history:
npx prisma db push
```

### 10c. Import Data into New Database

```bash
# Import data into the new production database
psql "<new-neon-main-branch-url>" -f old-db-data-backup.sql

# Import into dev branch too (optional)
psql "<new-neon-dev-branch-url>" -f old-db-data-backup.sql
```

### 10d. Verify Data

```bash
# Connect to new database and verify row counts
psql "<new-neon-main-branch-url>" -c "
  SELECT 'members' as table_name, count(*) FROM members
  UNION ALL SELECT 'events', count(*) FROM events
  UNION ALL SELECT 'income', count(*) FROM income
  UNION ALL SELECT 'expenses', count(*) FROM expenses
  UNION ALL SELECT 'committee_members', count(*) FROM committee_members
  UNION ALL SELECT 'settings', count(*) FROM settings
  UNION ALL SELECT 'email_templates', count(*) FROM email_templates;
"
```

### 10e. Update Committee Members Table

The `committee_members` table controls admin access. You must add the new email:

```sql
-- Connect to the new database and add the new admin email
INSERT INTO committee_members (email, name, designation, role, "addedAt", "addedBy")
VALUES ('<new-email>@gmail.com', 'Your Name', 'Admin', 'admin', NOW()::text, 'migration');
```

---

## 11. Vercel Redeployment

After all env vars are updated:

1. Go to Vercel dashboard > your project
2. **Settings > Environment Variables** — verify all values are set
3. **Deployments** > click the latest deployment > **Redeploy**
4. Monitor build logs for any errors

---

## 12. Post-Migration Verification

Test each service after migration:

### Checklist

- [ ] **Google OAuth:** Can log in with Google on the app
- [ ] **Database:** Member list loads, can create/edit/delete records
- [ ] **Blob Storage:** Can upload receipts/images
- [ ] **Square:** Test payment in sandbox mode
- [ ] **PayPal:** Test payment in sandbox mode
- [ ] **Gmail SMTP:** Send a test email (e.g., membership application triggers email)
- [ ] **Google Analytics:** Check real-time view shows page visits
- [ ] **Sentry:** Trigger a test error, verify it appears in new Sentry dashboard
- [ ] **Admin Access:** New email has admin role in committee_members table
- [ ] **Member Portal:** Members can log in and view their profile

### Cleanup (After Verification)

- [ ] Delete or archive old Vercel project (if not transferred)
- [ ] Remove old email from Google Analytics property (if transferred)
- [ ] Deactivate old Square app credentials
- [ ] Deactivate old PayPal app credentials
- [ ] Revoke old Gmail app password
- [ ] Delete old Sentry auth tokens
- [ ] Keep old Neon database for 30 days as backup, then delete

---

## Migration Order (Recommended)

Execute in this order to minimize downtime:

| Step | Service | Downtime? | Risk |
|------|---------|-----------|------|
| 1 | Gmail SMTP (Section 7) | None | Low |
| 2 | Sentry (Section 8) | None | Low |
| 3 | Google Analytics (Section 2c) | None | Low |
| 4 | Google Cloud OAuth (Section 2a-b) | None | Medium |
| 5 | Square (Section 5) | None | Medium |
| 6 | PayPal (Section 6) | None | Medium |
| 7 | Neon Database (Section 3 + 10) | **Brief** | **High** |
| 8 | Vercel (Section 4) | **Brief** | **High** |
| 9 | Update all env vars (Section 9) | None | High |
| 10 | Redeploy (Section 11) | **~2 min** | High |
| 11 | Verify (Section 12) | None | — |

**Estimated total downtime:** ~5 minutes (during database switchover + redeploy)

**Tip:** Do steps 1-6 in advance (days before). Steps 7-10 should be done together during a low-traffic window.
