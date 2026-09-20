-- AlterTable
ALTER TABLE "events" ADD COLUMN     "items" JSONB,
ADD COLUMN     "registrationModel" TEXT NOT NULL DEFAULT 'legacy';

-- CreateTable
CREATE TABLE "event_item_registrations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT,
    "guestId" TEXT,
    "registrantType" TEXT NOT NULL DEFAULT '',
    "attendeeCount" INTEGER NOT NULL DEFAULT 1,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "baseRegistrationFee" TEXT NOT NULL DEFAULT '0',
    "customFieldResponses" JSONB,
    "totalPrice" TEXT NOT NULL DEFAULT '0',
    "priceBreakdown" JSONB,
    "paymentStatus" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "transactionId" TEXT NOT NULL DEFAULT '',
    "registrationStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_item_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration_participants" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "age" TEXT NOT NULL DEFAULT '',
    "checkedInAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_registration_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration_item_selections" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceCharged" TEXT NOT NULL DEFAULT '0',
    "customFieldResponses" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelledAt" TEXT NOT NULL DEFAULT '',
    "refundedAmount" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "event_registration_item_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_item_registrations_eventId_idx" ON "event_item_registrations"("eventId");

-- CreateIndex
CREATE INDEX "event_item_registrations_memberId_idx" ON "event_item_registrations"("memberId");

-- CreateIndex
CREATE INDEX "event_item_registrations_guestId_idx" ON "event_item_registrations"("guestId");

-- CreateIndex
CREATE INDEX "event_item_registrations_contactEmail_idx" ON "event_item_registrations"("contactEmail");

-- CreateIndex
CREATE INDEX "event_registration_participants_registrationId_idx" ON "event_registration_participants"("registrationId");

-- CreateIndex
CREATE INDEX "event_registration_item_selections_registrationId_idx" ON "event_registration_item_selections"("registrationId");

-- CreateIndex
CREATE INDEX "event_registration_item_selections_itemId_idx" ON "event_registration_item_selections"("itemId");

-- AddForeignKey
ALTER TABLE "event_item_registrations" ADD CONSTRAINT "event_item_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_item_registrations" ADD CONSTRAINT "event_item_registrations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_item_registrations" ADD CONSTRAINT "event_item_registrations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration_participants" ADD CONSTRAINT "event_registration_participants_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_item_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration_item_selections" ADD CONSTRAINT "event_registration_item_selections_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_item_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
