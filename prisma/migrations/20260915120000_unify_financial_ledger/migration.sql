-- AlterTable: fin_categories — stable machine key for category resolution (never resolve by display name)
ALTER TABLE "fin_categories" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "fin_categories_code_key" ON "fin_categories"("code");

-- AlterTable: fin_raw_transactions — sponsorship linkage + reimbursement workflow fields
ALTER TABLE "fin_raw_transactions"
  ADD COLUMN "sponsorId" TEXT,
  ADD COLUMN "receiptUrl" TEXT,
  ADD COLUMN "receiptFileId" TEXT,
  ADD COLUMN "reimbursementStatus" TEXT,
  ADD COLUMN "reimbursementMethod" TEXT,
  ADD COLUMN "reimbursementAmount" DECIMAL(12,2),
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "approvedDate" TIMESTAMP(3),
  ADD COLUMN "reimbursedDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fin_raw_transactions_sponsorId_idx" ON "fin_raw_transactions"("sponsorId");

-- CreateIndex
CREATE INDEX "fin_raw_transactions_reimbursementStatus_idx" ON "fin_raw_transactions"("reimbursementStatus");

-- AddForeignKey
ALTER TABLE "fin_raw_transactions" ADD CONSTRAINT "fin_raw_transactions_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
