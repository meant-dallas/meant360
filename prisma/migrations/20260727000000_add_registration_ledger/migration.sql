-- Replace the per-participant paymentHistory JSON blob (added in an earlier
-- migration this session, never used in real production data) with a proper
-- append-only ledger table that survives independently of the
-- EventParticipant row it references, and is never updated or deleted after
-- insert.
CREATE TABLE "registration_ledger_entries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" TEXT,
    "method" TEXT,
    "transactionId" TEXT,
    "refundsTransactionId" TEXT,
    "snapshot" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registration_ledger_entries_eventId_idx" ON "registration_ledger_entries"("eventId");
CREATE INDEX "registration_ledger_entries_participantId_idx" ON "registration_ledger_entries"("participantId");
CREATE INDEX "registration_ledger_entries_eventId_email_idx" ON "registration_ledger_entries"("eventId", "email");

ALTER TABLE "registration_ledger_entries" ADD CONSTRAINT "registration_ledger_entries_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_participants" DROP COLUMN IF EXISTS "paymentHistory";
