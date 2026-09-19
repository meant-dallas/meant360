-- Adds email/media consent to the items registration model, mirroring
-- EventParticipant's emailConsent/mediaConsent on the legacy model.
ALTER TABLE "event_item_registrations" ADD COLUMN "emailConsent" TEXT NOT NULL DEFAULT 'true';
ALTER TABLE "event_item_registrations" ADD COLUMN "mediaConsent" TEXT NOT NULL DEFAULT '';
