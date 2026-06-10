-- CreateTable
CREATE TABLE "CostVoucherDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "costAllocationId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "warningCodesJson" TEXT,
  "voucherDraftJson" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostVoucherDraft_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CostVoucherDraft_costAllocationId_fkey" FOREIGN KEY ("costAllocationId") REFERENCES "CostAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CostVoucherDraft_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryReconciliationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "inventoryBalanceTotal" REAL NOT NULL DEFAULT 0,
  "costAdjustmentTotal" REAL NOT NULL DEFAULT 0,
  "differenceAmount" REAL NOT NULL DEFAULT 0,
  "rowsJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReconciliationRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CostVoucherDraft_accountSetId_fiscalYear_periodNo_idx" ON "CostVoucherDraft"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "InventoryReconciliationRun_accountSetId_fiscalYear_periodNo_idx" ON "InventoryReconciliationRun"("accountSetId", "fiscalYear", "periodNo");
