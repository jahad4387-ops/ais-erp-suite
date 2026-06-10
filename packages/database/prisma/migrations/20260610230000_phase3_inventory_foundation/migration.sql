-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'raw_material',
    "unit" TEXT NOT NULL,
    "costMethod" TEXT NOT NULL,
    "isBatchManaged" BOOLEAN NOT NULL DEFAULT false,
    "isSerialManaged" BOOLEAN NOT NULL DEFAULT false,
    "isManufactured" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeDays" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "manufactureDate" DATETIME,
    "expiryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBatch_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySerial_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySerial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "productItemId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "yieldQuantity" REAL NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bom_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bom_productItemId_fkey" FOREIGN KEY ("productItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BomLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bomId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "scrapRate" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "BomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BomLine_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarehouseLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" REAL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "WarehouseLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryOpeningBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "batchNo" TEXT,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL DEFAULT 0,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryOpeningBalance_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryOpeningBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryOpeningBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryOpeningBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_accountSetId_code_key" ON "InventoryItem"("accountSetId", "code");
CREATE UNIQUE INDEX "InventoryBatch_accountSetId_itemId_batchNo_key" ON "InventoryBatch"("accountSetId", "itemId", "batchNo");
CREATE UNIQUE INDEX "InventorySerial_accountSetId_serialNo_key" ON "InventorySerial"("accountSetId", "serialNo");
CREATE UNIQUE INDEX "Bom_accountSetId_productItemId_version_key" ON "Bom"("accountSetId", "productItemId", "version");
CREATE UNIQUE INDEX "BomLine_bomId_lineNo_key" ON "BomLine"("bomId", "lineNo");
CREATE UNIQUE INDEX "Warehouse_accountSetId_code_key" ON "Warehouse"("accountSetId", "code");
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId", "code");
CREATE INDEX "InventoryOpeningBalance_accountSetId_itemId_idx" ON "InventoryOpeningBalance"("accountSetId", "itemId");
CREATE UNIQUE INDEX "InventoryOpeningBalance_unique_dimension_key" ON "InventoryOpeningBalance"("accountSetId", "itemId", "warehouseId", "locationId", "batchNo", "fiscalYear", "periodNo");
