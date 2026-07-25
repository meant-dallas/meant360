-- Per-event toggles for self-service registration edit and cancel-with-refund,
-- so these can be tested on a single event before enabling broadly.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "selfServiceEditEnabled" TEXT NOT NULL DEFAULT '';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancelRefundEnabled" TEXT NOT NULL DEFAULT '';
