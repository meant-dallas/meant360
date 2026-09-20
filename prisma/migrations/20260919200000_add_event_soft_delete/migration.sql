-- Soft-delete marker for events — hard delete routinely fails on FK
-- constraints once an event has any real activity (participants, ledger
-- entries, fin transactions, sponsors, etc.).
ALTER TABLE "events" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "events_deletedAt_idx" ON "events"("deletedAt");
