-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "spouseName" TEXT NOT NULL DEFAULT '',
    "spouseEmail" TEXT NOT NULL DEFAULT '',
    "spousePhone" TEXT NOT NULL DEFAULT '',
    "children" JSONB,
    "membershipType" TEXT NOT NULL DEFAULT 'Yearly',
    "membershipYears" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "registrationDate" TEXT NOT NULL DEFAULT '',
    "renewalDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "loginEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "referredBy" TEXT NOT NULL DEFAULT '',
    "eventsAttended" INTEGER NOT NULL DEFAULT 0,
    "lastEventDate" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "parentEventId" TEXT NOT NULL DEFAULT '',
    "pricingRules" JSONB,
    "formConfig" JSONB,
    "activities" JSONB,
    "activityPricingMode" TEXT NOT NULL DEFAULT '',
    "guestPolicy" JSONB,
    "registrationOpen" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "memberId" TEXT,
    "guestId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "registeredAdults" TEXT NOT NULL DEFAULT '',
    "registeredKids" TEXT NOT NULL DEFAULT '',
    "registeredAt" TEXT NOT NULL DEFAULT '',
    "actualAdults" TEXT NOT NULL DEFAULT '',
    "actualKids" TEXT NOT NULL DEFAULT '',
    "checkedInAt" TEXT NOT NULL DEFAULT '',
    "selectedActivities" JSONB,
    "customFields" JSONB,
    "totalPrice" TEXT NOT NULL DEFAULT '0',
    "priceBreakdown" JSONB,
    "paymentStatus" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "transactionId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income" (
    "id" TEXT NOT NULL,
    "incomeType" TEXT NOT NULL DEFAULT 'Other',
    "eventName" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "payerName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL DEFAULT 'General',
    "eventName" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Miscellaneous',
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL DEFAULT '',
    "paidBy" TEXT NOT NULL DEFAULT 'Organization',
    "receiptUrl" TEXT NOT NULL DEFAULT '',
    "receiptFileId" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "needsReimbursement" TEXT NOT NULL DEFAULT '',
    "reimbStatus" TEXT NOT NULL DEFAULT '',
    "reimbMethod" TEXT NOT NULL DEFAULT '',
    "reimbAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "approvedDate" TEXT NOT NULL DEFAULT '',
    "reimbursedDate" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'Annual',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eventName" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "year" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "paymentDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "payerName" TEXT NOT NULL DEFAULT '',
    "payerEmail" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "tag" TEXT NOT NULL DEFAULT '',
    "eventName" TEXT NOT NULL DEFAULT '',
    "syncedAt" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_members" (
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "addedAt" TEXT NOT NULL DEFAULT '',
    "addedBy" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "committee_members_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL DEFAULT '',
    "userEmail" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "changedFields" JSONB,
    "oldValues" JSONB,
    "newValues" JSONB,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_email_idx" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_spouseEmail_idx" ON "members"("spouseEmail");

-- CreateIndex
CREATE INDEX "members_loginEmail_idx" ON "members"("loginEmail");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "guests_email_idx" ON "guests"("email");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_name_idx" ON "events"("name");

-- CreateIndex
CREATE INDEX "event_participants_eventId_idx" ON "event_participants"("eventId");

-- CreateIndex
CREATE INDEX "event_participants_memberId_idx" ON "event_participants"("memberId");

-- CreateIndex
CREATE INDEX "event_participants_guestId_idx" ON "event_participants"("guestId");

-- CreateIndex
CREATE INDEX "event_participants_email_idx" ON "event_participants"("email");

-- CreateIndex
CREATE INDEX "event_participants_eventId_email_idx" ON "event_participants"("eventId", "email");

-- CreateIndex
CREATE INDEX "income_eventId_idx" ON "income"("eventId");

-- CreateIndex
CREATE INDEX "income_eventName_idx" ON "income"("eventName");

-- CreateIndex
CREATE INDEX "income_date_idx" ON "income"("date");

-- CreateIndex
CREATE INDEX "expenses_eventId_idx" ON "expenses"("eventId");

-- CreateIndex
CREATE INDEX "expenses_eventName_idx" ON "expenses"("eventName");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "sponsors_eventId_idx" ON "sponsors"("eventId");

-- CreateIndex
CREATE INDEX "sponsors_eventName_idx" ON "sponsors"("eventName");

-- CreateIndex
CREATE INDEX "sponsors_year_idx" ON "sponsors"("year");

-- CreateIndex
CREATE INDEX "sponsors_status_idx" ON "sponsors"("status");

-- CreateIndex
CREATE INDEX "transactions_externalId_idx" ON "transactions"("externalId");

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transactions_eventName_idx" ON "transactions"("eventName");

-- CreateIndex
CREATE INDEX "activity_log_entityType_idx" ON "activity_log"("entityType");

-- CreateIndex
CREATE INDEX "activity_log_userEmail_idx" ON "activity_log"("userEmail");

-- CreateIndex
CREATE INDEX "activity_log_timestamp_idx" ON "activity_log"("timestamp");

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income" ADD CONSTRAINT "income_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
