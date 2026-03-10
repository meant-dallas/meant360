# Service Account Migration Plan

Migrate all external services to new accounts using an organization email, while keeping the current GitHub repository.

**Organization Email:** `___________@meant.org` (non-Gmail — used for all account ownership)
**Gmail for SMTP:** `___________@gmail.com` (needed only for sending emails via Gmail SMTP)
**Domain Setup:**
- `www.meant.org` — existing public website (hosted elsewhere, no changes)
- `portal.meant.org` — MEANT Portal app (hosted on Vercel)

> **Important:** Most services (Google Cloud, Vercel, Neon, Square, PayPal, Sentry) accept **any email address** for signup — a Gmail account is NOT required. Use your organization email (e.g., `admin@meant.org`) as the owner for all services. A separate Gmail is only needed for the SMTP email sending feature (Section 7).

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
- [ ] Have a Gmail account ready for SMTP email sending (only if you don't already have one)
- [ ] Enable 2FA on both accounts
- [ ] Export/backup the current production database (see Section 10)
- [ ] Document all current env var values from `.env.local`, `.env.development.local`, `.env.production.local`
- [ ] Confirm access to DNS settings for `meant.org` (at your domain registrar)
- [ ] Keep old accounts active until migration is fully verified

---

## 2. Google Cloud Console

Google Cloud provides 2 services: **OAuth login** and **Analytics**.

### 2a. Create Google Account with Organization Email

1. Go to https://accounts.google.com/signup
2. Click **"Use my current email address instead"**
3. Enter your organization email (e.g., `admin@meant.org`)
4. Follow the verification prompts — Google will send a code to your org email
5. Complete the account setup and **enable 2-Step Verification**

> This creates a Google account linked to your non-Gmail address, giving you access to Google Cloud, Analytics, and other Google services.

### 2b. Create New Google Cloud Project

1. Go to https://console.cloud.google.com
2. Sign in with your organization email (Google account from 2a)
3. Click "Select a project" > "New Project"
4. Name: `meant-portal`
5. Note the **Project ID**

### 2c. Google OAuth (User Login)

1. In the new project, go to **APIs & Services > OAuth consent screen**
2. Choose "External" user type
3. Fill in app name: `MEANT Portal`, support email: organization email
4. Add authorized domains: `meant.org`
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth client ID**
7. Application type: **Web application**
8. Name: `MEANT Portal`
9. Authorized JavaScript origins:
   - `http://localhost:3000` (dev)
   - `https://portal.meant.org` (prod)
10. Authorized redirect URIs:
    - `http://localhost:3000/api/auth/callback/google` (dev)
    - `https://portal.meant.org/api/auth/callback/google` (prod)
11. Copy the **Client ID** and **Client Secret**

**Env vars to update:**
```
GOOGLE_CLIENT_ID=<new-client-id>
GOOGLE_CLIENT_SECRET=<new-client-secret>
```

**Files that reference this:**
- `.env.local` (lines 6-7)
- Vercel dashboard environment variables

### 2d. Google Analytics 4

1. Go to https://analytics.google.com
2. Sign in with your organization email (same Google account from 2a)
3. Create a new GA4 property or transfer the existing one:
   - **Option A (New property):** Admin > Create Property > set up data stream for `portal.meant.org`
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
- [ ] `___________` (Owner)
- [ ] `___________` (Member)
- [ ] `___________` (Member)
- [ ] _(add more as needed)_

### 4c. Configure Project in New Org

1. In the org dashboard, go to the imported project
2. **Settings > General** — verify the GitHub repo is connected
3. **Settings > Git** — confirm branch deployments:
   - Production branch: `main`
   - Preview branches: `dev` and feature branches
4. **Settings > Environment Variables** — add all env vars (see Section 9)

### 4d. Subdomain Setup (`portal.meant.org`)

Since `www.meant.org` is already hosting your public website on another platform, the MEANT Portal app will use a subdomain: `portal.meant.org`.

#### How Subdomains Work

Your domain `meant.org` can have multiple subdomains, each pointing to a different server:

```
meant.org (DNS records you control)
|-- www.meant.org     --> Existing public website (other host, no changes)
|-- portal.meant.org  --> Vercel (MEANT Portal app)
```

Each subdomain is an independent DNS record. The two apps are completely isolated — changes to one don't affect the other. Each gets its own SSL certificate automatically.

#### Step 1: Add Domain in Vercel

1. Go to project **Settings > Domains**
2. Add `portal.meant.org`
3. Vercel will show the DNS record you need to configure

#### Step 2: Configure DNS at Your Domain Registrar

Log in to your domain registrar (wherever `meant.org` is managed) and add this DNS record:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| `CNAME` | `portal` | `cname.vercel-dns.com` | Points portal.meant.org to Vercel |

> **Note:** Do NOT modify any existing DNS records for `www` or `@` (apex) — those point to your existing public website and must remain unchanged.

#### Step 3: SSL Certificate

- Vercel automatically provisions a free SSL certificate via Let's Encrypt
- After DNS propagates (usually minutes, up to 48 hours), Vercel will issue the cert
- Verify by visiting `https://portal.meant.org` — should show a valid HTTPS connection

#### Step 4: Update App Configuration

After the subdomain is live, update these references:

1. **Environment variable:**
   ```
   NEXTAUTH_URL=https://portal.meant.org
   ```
2. **Google OAuth** (Section 2c) — already configured with `portal.meant.org` above
3. **Square** — update allowed domain in Square Developer Dashboard
4. **PayPal** — update return URLs in PayPal Developer Dashboard
5. **Google Analytics** — update the data stream URL to `portal.meant.org`

#### Step 5: Verify Subdomain is Working

- [ ] `https://portal.meant.org` loads the app
- [ ] `http://portal.meant.org` redirects to `https://portal.meant.org`
- [ ] `https://www.meant.org` still loads the existing public website (unaffected)
- [ ] Google OAuth login works with the new subdomain
- [ ] Payment flows work with the new subdomain (test in sandbox first)
- [ ] Emails contain the correct `portal.meant.org` URLs

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

**Note:** Transaction history from the old Square account will NOT be accessible from the new account. Export it from the old account first if needed.

---

## 6. PayPal (Payments)

### 6a. Create New PayPal Account

1. Go to https://www.paypal.com/signup
2. Sign up with your **organization email** (accepts any email)
3. Then go to https://developer.paypal.com and log in
4. Go to **Apps & Credentials**
5. Click **Create App**
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
SMTP_GMAIL_USER=<your-gmail>@gmail.com
SMTP_GMAIL_PASS=<new-16-char-app-password>
```

**Files that reference this:**
- `.env.local` (lines 55-56)
- `src/services/email.service.ts`

**Important:** Email sender address will change. Notify members that emails will now come from the new Gmail address.

---

## 8. Sentry (Error Monitoring)

### 8a. Create New Sentry Account

1. Go to https://sentry.io
2. Sign up with your **organization email** (accepts any email)
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
| `NEXTAUTH_URL` | NextAuth | Set to `https://portal.meant.org` |
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
pg_dump "<old-neon-production-url>" \
  --data-only \
  --no-owner \
  --no-privileges \
  -f old-db-data-backup.sql

# Also export schema for reference
pg_dump "<old-neon-production-url>" \
  --schema-only \
  --no-owner \
  --no-privileges \
  -f old-db-schema-backup.sql
```

> **Tip:** Get the old production URL from your current `.env.production.local` or Vercel dashboard.

### 10b. Apply Schema to New Database

```bash
# Update .env.development.local with the NEW Neon URLs first, then:
npx prisma migrate deploy

# Or if starting fresh with no migration history:
npx prisma db push
```

### 10c. Import Data into New Database

```bash
# Import data into the new production database
psql "<new-neon-main-branch-url>" -f old-db-data-backup.sql

# Import into dev branch too (optional, useful for testing)
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

The `committee_members` table controls admin access. Add the organization email:

```sql
-- Connect to the new database and add the admin
INSERT INTO committee_members (email, name, designation, role, "addedAt", "addedBy")
VALUES ('<org-email>@meant.org', 'Your Name', 'Admin', 'admin', NOW()::text, 'migration');
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

- [ ] **Subdomain:** `https://portal.meant.org` loads the app
- [ ] **Existing site:** `https://www.meant.org` still works (unaffected)
- [ ] **Google OAuth:** Can log in with Google on `portal.meant.org`
- [ ] **Database:** Member list loads, can create/edit/delete records
- [ ] **Blob Storage:** Can upload receipts/images
- [ ] **Square:** Test payment in sandbox mode
- [ ] **PayPal:** Test payment in sandbox mode
- [ ] **Gmail SMTP:** Send a test email (e.g., membership application triggers email)
- [ ] **Google Analytics:** Check real-time view shows page visits on `portal.meant.org`
- [ ] **Sentry:** Trigger a test error, verify it appears in new Sentry dashboard
- [ ] **Admin Access:** Organization email has admin role in committee_members table
- [ ] **Member Portal:** Members can log in and view their profile
- [ ] **Email URLs:** Emails contain `portal.meant.org` URLs (not old domain)

### Cleanup (After Verification)

- [ ] Delete or archive old Vercel project
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
| 1 | Create Google account with org email (Section 2a) | None | Low |
| 2 | Gmail SMTP (Section 7) | None | Low |
| 3 | Sentry (Section 8) | None | Low |
| 4 | Google Analytics (Section 2d) | None | Low |
| 5 | Google Cloud OAuth (Section 2b-c) | None | Medium |
| 6 | Square (Section 5) | None | Medium |
| 7 | PayPal (Section 6) | None | Medium |
| 8 | Neon Database (Section 3 + 10) | **Brief** | **High** |
| 9 | Vercel Org + Subdomain (Section 4) | **Brief** | **High** |
| 10 | Update all env vars (Section 9) | None | High |
| 11 | Redeploy (Section 11) | **~2 min** | High |
| 12 | Verify (Section 12) | None | -- |

**Estimated total downtime:** ~5 minutes (during database switchover + redeploy)

**Tips:**
- Do steps 1-7 in advance (days before the switchover). These create new accounts and don't affect the running app.
- Steps 8-11 should be done together during a low-traffic window.
- The subdomain DNS (step 9) can also be configured early — it won't conflict with the existing `www` site.

---

## Quick Reference: Account Ownership Summary

| Service | Sign-up Email | Notes |
|---------|--------------|-------|
| Google Cloud (OAuth + Analytics) | Organization email | Create Google account with "Use my current email" |
| Neon PostgreSQL | Organization email | Direct signup |
| Vercel | Organization email | Direct signup |
| Square | Organization email | Direct signup |
| PayPal | Organization email | Direct signup |
| Sentry | Organization email | Direct signup |
| Gmail SMTP | Gmail account | Only service requiring Gmail |
| GitHub | Existing account | No changes needed |
