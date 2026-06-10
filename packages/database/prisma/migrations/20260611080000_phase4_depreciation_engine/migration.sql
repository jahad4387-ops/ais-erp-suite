-- AlterTable
ALTER TABLE "FixedAsset" ADD COLUMN "isDepreciationStopped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FixedAsset" ADD COLUMN "depreciationStoppedAt" DATETIME;

-- CreateTable
CREATE TABLE "DepreciationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "runNo" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "totalDepreciationAmount" REAL NOT NULL DEFAULT 0,
  "lineCount" INTEGER NOT NULL DEFAULT 0,
  "warningCodesJson" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "lockedBy" TEXT,
  "lockedAt" DATETIME,
  CONSTRAINT "DepreciationRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepreciationRunLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "depreciationRunId" TEXT NOT NULL,
  "fixedAssetId" TEXT NOT NULL,
  "assetNo" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "departmentName" TEXT,
  "originalValue" REAL NOT NULL,
  "salvageValue" REAL NOT NULL DEFAULT 0,
  "accumulatedDepreciationBefore" REAL NOT NULL DEFAULT 0,
  "depreciationAmount" REAL NOT NULL DEFAULT 0,
  "accumulatedDepreciationAfter" REAL NOT NULL DEFAULT 0,
  "netValueAfter" REAL NOT NULL DEFAULT 0,
  "brakeApplied" BOOLEAN NOT NULL DEFAULT false,
  "skippedReason" TEXT,
  "depreciationTimelineRule" TEXT NOT NULL DEFAULT 'new_asset_next_month',
  "depreciationDepartmentRule" TEXT NOT NULL DEFAULT 'month_end_department',
  CONSTRAINT "DepreciationRunLine_depreciationRunId_fkey" FOREIGN KEY ("depreciationRunId") REFERENCES "DepreciationRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DepreciationRunLine_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetDepreciationCostPoolOutput" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "sourceRunId" TEXT NOT NULL,
  "fixedAssetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "departmentId" TEXT NOT NULL,
  "costType" TEXT NOT NULL DEFAULT 'fixed_asset_depreciation',
  "amount" REAL NOT NULL DEFAULT 0,
  "lockedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDepreciationCostPoolOutput_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetDepreciationCostPoolOutput_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "DepreciationRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetDepreciationCostPoolOutput_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DepreciationRun_accountSetId_fiscalYear_periodNo_idx" ON "DepreciationRun"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "DepreciationRunLine_fixedAssetId_idx" ON "DepreciationRunLine"("fixedAssetId");

-- CreateIndex
CREATE INDEX "AssetDepreciationCostPoolOutput_accountSetId_fiscalYear_periodNo_idx" ON "AssetDepreciationCostPoolOutput"("accountSetId", "fiscalYear", "periodNo");
