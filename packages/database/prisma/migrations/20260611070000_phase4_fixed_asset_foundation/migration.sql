-- CreateTable
CREATE TABLE "AssetCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "depreciationMethodId" TEXT,
  "defaultUsefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
  "defaultSalvageRate" REAL NOT NULL DEFAULT 0,
  "assetAccountCode" TEXT,
  "accumulatedDepreciationAccountCode" TEXT,
  "depreciationExpenseAccountCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetCategory_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetCategory_depreciationMethodId_fkey" FOREIGN KEY ("depreciationMethodId") REFERENCES "DepreciationMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepreciationMethod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "methodType" TEXT NOT NULL DEFAULT 'straight_line',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepreciationMethod_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixedAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "assetNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "depreciationMethodId" TEXT NOT NULL,
  "acquisitionType" TEXT NOT NULL DEFAULT 'purchase',
  "acquisitionDate" DATETIME NOT NULL,
  "originalValue" REAL NOT NULL,
  "accumulatedDepreciation" REAL NOT NULL DEFAULT 0,
  "netValue" REAL NOT NULL,
  "salvageValue" REAL NOT NULL DEFAULT 0,
  "usefulLifeMonths" INTEGER NOT NULL,
  "serviceStartYear" INTEGER NOT NULL,
  "serviceStartPeriod" INTEGER NOT NULL,
  "depreciationTimelineRule" TEXT NOT NULL DEFAULT 'new_asset_next_month',
  "depreciationDepartmentRule" TEXT NOT NULL DEFAULT 'month_end_department',
  "currentDepartmentId" TEXT NOT NULL,
  "currentDepartmentName" TEXT,
  "responsiblePerson" TEXT,
  "usageStatus" TEXT NOT NULL DEFAULT 'in_use',
  "lastTransferAt" DATETIME,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixedAsset_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FixedAsset_depreciationMethodId_fkey" FOREIGN KEY ("depreciationMethodId") REFERENCES "DepreciationMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetTransfer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fixedAssetId" TEXT NOT NULL,
  "transferDate" DATETIME NOT NULL,
  "fromDepartmentId" TEXT NOT NULL,
  "fromDepartmentName" TEXT,
  "toDepartmentId" TEXT NOT NULL,
  "toDepartmentName" TEXT,
  "responsiblePerson" TEXT,
  "depreciationDepartmentRule" TEXT NOT NULL DEFAULT 'month_end_department',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetTransfer_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetTransfer_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetValueChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fixedAssetId" TEXT NOT NULL,
  "changeDate" DATETIME NOT NULL,
  "changeType" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "originalValueBefore" REAL NOT NULL,
  "originalValueAfter" REAL NOT NULL,
  "netValueAfter" REAL NOT NULL,
  "reason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetValueChange_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetValueChange_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_accountSetId_code_key" ON "AssetCategory"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationMethod_accountSetId_code_key" ON "DepreciationMethod"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_accountSetId_assetNo_key" ON "FixedAsset"("accountSetId", "assetNo");

-- CreateIndex
CREATE INDEX "AssetTransfer_fixedAssetId_transferDate_idx" ON "AssetTransfer"("fixedAssetId", "transferDate");

-- CreateIndex
CREATE INDEX "AssetValueChange_fixedAssetId_changeDate_idx" ON "AssetValueChange"("fixedAssetId", "changeDate");
