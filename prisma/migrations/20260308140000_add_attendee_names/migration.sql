-- AlterTable
ALTER TABLE "event_participants" ADD COLUMN IF NOT EXISTS "attendeeNames" TEXT NOT NULL DEFAULT '';
