-- Per-email OTP attempt-limit hardening (see docs/unified-registration-checkin-flow.html).
ALTER TABLE "login_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
