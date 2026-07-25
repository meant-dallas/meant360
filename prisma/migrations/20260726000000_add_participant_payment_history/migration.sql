-- Per-participant ledger of individual charges/refunds, so a registration
-- that's paid across multiple captures (initial payment + edit top-ups) can
-- be refunded correctly against each capture instead of overwriting a single
-- transactionId and losing track of earlier captures.
ALTER TABLE "event_participants" ADD COLUMN IF NOT EXISTS "paymentHistory" JSONB;
