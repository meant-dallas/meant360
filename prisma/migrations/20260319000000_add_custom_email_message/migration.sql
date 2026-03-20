-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "customEmailMessage" TEXT NOT NULL DEFAULT '';
