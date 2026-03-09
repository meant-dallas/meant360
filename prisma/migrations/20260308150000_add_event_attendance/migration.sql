-- CreateTable
CREATE TABLE "event_attendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "memberId" TEXT,
    "checkedInAt" TEXT NOT NULL DEFAULT '',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 10,
    "year" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_attendance_eventId_email_key" ON "event_attendance"("eventId", "email");

-- CreateIndex
CREATE INDEX "event_attendance_email_idx" ON "event_attendance"("email");

-- CreateIndex
CREATE INDEX "event_attendance_memberId_idx" ON "event_attendance"("memberId");

-- CreateIndex
CREATE INDEX "event_attendance_year_idx" ON "event_attendance"("year");

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
