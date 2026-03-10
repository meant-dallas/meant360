-- AlterTable
ALTER TABLE "events" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "event_participants" ADD COLUMN "registrationStatus" TEXT NOT NULL DEFAULT 'confirmed';
