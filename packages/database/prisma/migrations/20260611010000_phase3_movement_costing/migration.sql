-- CreateTable
CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "documentNo" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceDocumentId" TEXT,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "costStatus" TEXT NOT NULL DEFAULT 'calculated',
  "totalQuantity" REAL NOT NULL DEFAULT 0,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryMovementLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movementId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "lineNo" INTEGER NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0,
  "zeroResidualAdjustment" REAL NOT NULL DEFAULT 0,
  "costBreakdownJson" TEXT,
  CONSTRAINT "InventoryMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovementLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovementLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovementLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "quantity" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryBalance_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryCostLayer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "sourceMovementId" TEXT,
  "sourceLineId" TEXT,
  "receivedQuantity" REAL NOT NULL DEFAULT 0,
  "receivedAmount" REAL NOT NULL DEFAULT 0,
  "remainingQuantity" REAL NOT NULL DEFAULT 0,
  "remainingAmount" REAL NOT NULL DEFAULT 0,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostLayer_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostLayer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostLayer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryCostLayer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "transferNo" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "fromLocationId" TEXT,
  "toWarehouseId" TEXT NOT NULL,
  "toLocationId" TEXT,
  "batchNo" TEXT,
  "quantity" REAL NOT NULL,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "outboundMovementId" TEXT NOT NULL,
  "inboundMovementId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransfer_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "countNo" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "totalDifferenceQuantity" REAL NOT NULL DEFAULT 0,
  "totalAdjustmentAmount" REAL NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCount_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCountLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stockCountId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "bookQuantity" REAL NOT NULL DEFAULT 0,
  "actualQuantity" REAL NOT NULL DEFAULT 0,
  "differenceQuantity" REAL NOT NULL DEFAULT 0,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "adjustmentAmount" REAL NOT NULL DEFAULT 0,
  "reason" TEXT,
  CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_accountSetId_documentNo_key" ON "InventoryMovement"("accountSetId", "documentNo");

-- CreateIndex
CREATE INDEX "InventoryMovement_accountSetId_fiscalYear_periodNo_idx" ON "InventoryMovement"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "InventoryMovementLine_itemId_warehouseId_idx" ON "InventoryMovementLine"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_unique_dimension_key" ON "InventoryBalance"("accountSetId", "itemId", "warehouseId", "locationId", "batchNo");

-- CreateIndex
CREATE INDEX "InventoryBalance_accountSetId_itemId_idx" ON "InventoryBalance"("accountSetId", "itemId");

-- CreateIndex
CREATE INDEX "InventoryCostLayer_accountSetId_itemId_status_idx" ON "InventoryCostLayer"("accountSetId", "itemId", "status");

-- CreateIndex
CREATE INDEX "InventoryCostLayer_warehouseId_batchNo_idx" ON "InventoryCostLayer"("warehouseId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_accountSetId_transferNo_key" ON "InventoryTransfer"("accountSetId", "transferNo");

-- CreateIndex
CREATE INDEX "InventoryTransfer_accountSetId_fiscalYear_periodNo_idx" ON "InventoryTransfer"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_accountSetId_countNo_key" ON "StockCount"("accountSetId", "countNo");

-- CreateIndex
CREATE INDEX "StockCount_accountSetId_fiscalYear_periodNo_idx" ON "StockCount"("accountSetId", "fiscalYear", "periodNo");
