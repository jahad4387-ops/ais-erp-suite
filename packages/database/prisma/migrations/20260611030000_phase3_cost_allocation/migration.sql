-- CreateTable
CREATE TABLE "MockCostInput" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "costType" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "lockedAt" DATETIME,
  "lockedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MockCostInput_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MockCostInput_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "totalAllocatedAmount" REAL NOT NULL DEFAULT 0,
  "warningCodesJson" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostAllocation_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CostAllocation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostAllocationLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "costAllocationId" TEXT NOT NULL,
  "costInputId" TEXT NOT NULL,
  "costType" TEXT NOT NULL,
  "allocatedAmount" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "CostAllocationLine_costAllocationId_fkey" FOREIGN KEY ("costAllocationId") REFERENCES "CostAllocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CostAllocationLine_costInputId_fkey" FOREIGN KEY ("costInputId") REFERENCES "MockCostInput" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryCostAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "costAllocationId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "quantity" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostAdjustment_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostAdjustment_costAllocationId_fkey" FOREIGN KEY ("costAllocationId") REFERENCES "CostAllocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostAdjustment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MockCostInput_workOrderId_idx" ON "MockCostInput"("workOrderId");

-- CreateIndex
CREATE INDEX "CostAllocation_workOrderId_idx" ON "CostAllocation"("workOrderId");

-- CreateIndex
CREATE INDEX "InventoryCostAdjustment_accountSetId_itemId_idx" ON "InventoryCostAdjustment"("accountSetId", "itemId");
