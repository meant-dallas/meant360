/*
  Warnings:

  - You are about to drop the column `address` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `children` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `membershipYears` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `spouseEmail` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `spouseName` on the `members` table. All the data in the column will be lost.
  - You are about to drop the column `spousePhone` on the `members` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "members_spouseEmail_idx";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "updatedAt" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "members" DROP COLUMN "address",
DROP COLUMN "children",
DROP COLUMN "membershipYears",
DROP COLUMN "name",
DROP COLUMN "spouseEmail",
DROP COLUMN "spouseName",
DROP COLUMN "spousePhone",
ADD COLUMN     "cellPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "college" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "employer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "homePhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "jobTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "middleName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nativePlace" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "qualifyingDegree" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "specialInterests" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "submissionId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "member_addresses" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "street2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_spouses" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "nativePlace" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "college" TEXT NOT NULL DEFAULT '',
    "qualifyingDegree" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_spouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_children" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "sex" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL DEFAULT '',
    "age" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_memberships" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_payments" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "amount" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payerName" TEXT NOT NULL DEFAULT '',
    "payerEmail" TEXT NOT NULL DEFAULT '',
    "transactionId" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_sponsors" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_member_imports" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL DEFAULT '',
    "respondentId" TEXT NOT NULL DEFAULT '',
    "submittedAt" TEXT NOT NULL DEFAULT '',
    "lastModifiedAt" TEXT NOT NULL DEFAULT '',
    "startedAt" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "homePhone" TEXT NOT NULL DEFAULT '',
    "cellPhone" TEXT NOT NULL DEFAULT '',
    "qualifyingDegree" TEXT NOT NULL DEFAULT '',
    "nativePlace" TEXT NOT NULL DEFAULT '',
    "college" TEXT NOT NULL DEFAULT '',
    "employer" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "specialInterests" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "street2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "spouseFirstName" TEXT NOT NULL DEFAULT '',
    "spouseMiddleName" TEXT NOT NULL DEFAULT '',
    "spouseLastName" TEXT NOT NULL DEFAULT '',
    "spouseEmail" TEXT NOT NULL DEFAULT '',
    "spousePhone" TEXT NOT NULL DEFAULT '',
    "spouseNativePlace" TEXT NOT NULL DEFAULT '',
    "spouseCompany" TEXT NOT NULL DEFAULT '',
    "spouseCollege" TEXT NOT NULL DEFAULT '',
    "spouseQualifyingDegree" TEXT NOT NULL DEFAULT '',
    "child1Name" TEXT NOT NULL DEFAULT '',
    "child1Sex" TEXT NOT NULL DEFAULT '',
    "child1Grade" TEXT NOT NULL DEFAULT '',
    "child1Age" TEXT NOT NULL DEFAULT '',
    "child1Dob" TEXT NOT NULL DEFAULT '',
    "child2Name" TEXT NOT NULL DEFAULT '',
    "child2Sex" TEXT NOT NULL DEFAULT '',
    "child2Grade" TEXT NOT NULL DEFAULT '',
    "child2Age" TEXT NOT NULL DEFAULT '',
    "child2Dob" TEXT NOT NULL DEFAULT '',
    "child3Name" TEXT NOT NULL DEFAULT '',
    "child3Sex" TEXT NOT NULL DEFAULT '',
    "child3Grade" TEXT NOT NULL DEFAULT '',
    "child3Age" TEXT NOT NULL DEFAULT '',
    "child3Dob" TEXT NOT NULL DEFAULT '',
    "child4Name" TEXT NOT NULL DEFAULT '',
    "child4Sex" TEXT NOT NULL DEFAULT '',
    "child4Grade" TEXT NOT NULL DEFAULT '',
    "child4Age" TEXT NOT NULL DEFAULT '',
    "child4Dob" TEXT NOT NULL DEFAULT '',
    "lifeMember" TEXT NOT NULL DEFAULT '',
    "status2024" TEXT NOT NULL DEFAULT '',
    "status2025" TEXT NOT NULL DEFAULT '',
    "status2026" TEXT NOT NULL DEFAULT '',
    "status2027" TEXT NOT NULL DEFAULT '',
    "status2028" TEXT NOT NULL DEFAULT '',
    "status2029" TEXT NOT NULL DEFAULT '',
    "sponsorName" TEXT NOT NULL DEFAULT '',
    "sponsorEmail" TEXT NOT NULL DEFAULT '',
    "sponsorPhone" TEXT NOT NULL DEFAULT '',
    "paypalPaymentInfo" TEXT NOT NULL DEFAULT '',
    "extra1" TEXT NOT NULL DEFAULT '',
    "extra2" TEXT NOT NULL DEFAULT '',
    "extra3" TEXT NOT NULL DEFAULT '',
    "extra4" TEXT NOT NULL DEFAULT '',
    "extra5" TEXT NOT NULL DEFAULT '',
    "extra6" TEXT NOT NULL DEFAULT '',
    "extra7" TEXT NOT NULL DEFAULT '',
    "extra8" TEXT NOT NULL DEFAULT '',
    "extra9" TEXT NOT NULL DEFAULT '',
    "extra10" TEXT NOT NULL DEFAULT '',
    "extra11" TEXT NOT NULL DEFAULT '',
    "extra12" TEXT NOT NULL DEFAULT '',
    "extra13" TEXT NOT NULL DEFAULT '',
    "extra14" TEXT NOT NULL DEFAULT '',
    "extra15" TEXT NOT NULL DEFAULT '',
    "extra16" TEXT NOT NULL DEFAULT '',
    "extra17" TEXT NOT NULL DEFAULT '',
    "extra18" TEXT NOT NULL DEFAULT '',
    "extra19" TEXT NOT NULL DEFAULT '',
    "extra20" TEXT NOT NULL DEFAULT '',
    "migrated" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "raw_member_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_addresses_memberId_idx" ON "member_addresses"("memberId");

-- CreateIndex
CREATE INDEX "member_spouses_memberId_idx" ON "member_spouses"("memberId");

-- CreateIndex
CREATE INDEX "member_spouses_email_idx" ON "member_spouses"("email");

-- CreateIndex
CREATE INDEX "member_children_memberId_idx" ON "member_children"("memberId");

-- CreateIndex
CREATE INDEX "member_memberships_memberId_idx" ON "member_memberships"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "member_memberships_memberId_year_key" ON "member_memberships"("memberId", "year");

-- CreateIndex
CREATE INDEX "member_payments_memberId_idx" ON "member_payments"("memberId");

-- CreateIndex
CREATE INDEX "member_sponsors_memberId_idx" ON "member_sponsors"("memberId");

-- CreateIndex
CREATE INDEX "raw_member_imports_email_idx" ON "raw_member_imports"("email");

-- CreateIndex
CREATE INDEX "raw_member_imports_submissionId_idx" ON "raw_member_imports"("submissionId");

-- CreateIndex
CREATE INDEX "raw_member_imports_migrated_idx" ON "raw_member_imports"("migrated");

-- AddForeignKey
ALTER TABLE "member_addresses" ADD CONSTRAINT "member_addresses_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_spouses" ADD CONSTRAINT "member_spouses_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_children" ADD CONSTRAINT "member_children_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_sponsors" ADD CONSTRAINT "member_sponsors_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
