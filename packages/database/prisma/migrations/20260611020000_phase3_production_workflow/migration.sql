-- CreateTable
CREATE TABLE "WorkOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "workOrderNo" TEXT NOT NULL,
  "productItemId" TEXT NOT NULL,
  "bomId" TEXT NOT NULL,
  "plannedQuantity" REAL NOT NULL,
  "completedQuantity" REAL NOT NULL DEFAULT 0,
  "directMaterialCost" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "releasedBy" TEXT,
  "closedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" DATETIME,
  "closedAt" DATETIME,
  CONSTRAINT "WorkOrder_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkOrder_productItemId_fkey" FOREIGN KEY ("productItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialRequisition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "requisitionNo" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "totalQuantity" REAL NOT NULL DEFAULT 0,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialRequisition_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaterialRequisition_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialRequisitionLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialRequisitionId" TEXT NOT NULL,
  "componentItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "lineNo" INTEGER NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "MaterialRequisitionLine_materialRequisitionId_fkey" FOREIGN KEY ("materialRequisitionId") REFERENCES "MaterialRequisition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaterialRequisitionLine_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaterialRequisitionLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MaterialRequisitionLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "costStatus" TEXT NOT NULL DEFAULT 'direct_material_only',
  "totalQuantity" REAL NOT NULL DEFAULT 0,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductReceipt_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductReceipt_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductReceiptLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productReceiptId" TEXT NOT NULL,
  "productItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT,
  "batchNo" TEXT,
  "lineNo" INTEGER NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "ProductReceiptLine_productReceiptId_fkey" FOREIGN KEY ("productReceiptId") REFERENCES "ProductReceipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductReceiptLine_productItemId_fkey" FOREIGN KEY ("productItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductReceiptLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductReceiptLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_accountSetId_workOrderNo_key" ON "WorkOrder"("accountSetId", "workOrderNo");

-- CreateIndex
CREATE INDEX "WorkOrder_accountSetId_status_idx" ON "WorkOrder"("accountSetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisition_accountSetId_requisitionNo_key" ON "MaterialRequisition"("accountSetId", "requisitionNo");

-- CreateIndex
CREATE INDEX "MaterialRequisition_workOrderId_idx" ON "MaterialRequisition"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReceipt_accountSetId_receiptNo_key" ON "ProductReceipt"("accountSetId", "receiptNo");

-- CreateIndex
CREATE INDEX "ProductReceipt_workOrderId_idx" ON "ProductReceipt"("workOrderId");
