-- Adds support for multi-entry activity items (e.g. a performance selected
-- twice with different entry types) on the items registration model.
ALTER TABLE "event_registration_item_selections" ADD COLUMN "entryTypeKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "event_registration_item_selections" ADD COLUMN "participantNames" JSONB;
