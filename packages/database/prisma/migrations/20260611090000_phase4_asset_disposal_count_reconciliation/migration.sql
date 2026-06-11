-- AlterTable
ALTER TABLE "FixedAsset" ADD COLUMN "disposalDate" DATETIME;
ALTER TABLE "FixedAsset" ADD COLUMN "depreciationStopYear" INTEGER;
ALTER TABLE "FixedAsset" ADD COLUMN "depreciationStopPeriod" INTEGER;

-- CreateTable
CREATE TABLE "AssetDisposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fixedAssetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "disposalDate" DATETIME NOT NULL,
  "disposalType" TEXT NOT NULL,
  "proceedsAmount" REAL NOT NULL DEFAULT 0,
  "netValueAtDisposal" REAL NOT NULL DEFAULT 0,
  "gainLossAmount" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "voucherDraftJson" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDisposal_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetDisposal_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "countNo" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "countDate" DATETIME NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "varianceCount" INTEGER NOT NULL DEFAULT 0,
  "voucherDraftJson" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetCount_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetCountLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetCountId" TEXT NOT NULL,
  "fixedAssetId" TEXT,
  "assetNo" TEXT NOT NULL,
  "assetName" TEXT,
  "departmentId" TEXT,
  "actualStatus" TEXT NOT NULL,
  "varianceType" TEXT NOT NULL,
  "bookValue" REAL NOT NULL DEFAULT 0,
  "estimatedValue" REAL NOT NULL DEFAULT 0,
  "remark" TEXT,
  CONSTRAINT "AssetCountLine_assetCountId_fkey" FOREIGN KEY ("assetCountId") REFERENCES "AssetCount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetCountLine_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixedAssetLedgerEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fixedAssetId" TEXT,
  "assetNo" TEXT,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceDocumentId" TEXT NOT NULL,
  "amount" REAL NOT NULL DEFAULT 0,
  "occurredAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixedAssetLedgerEntry_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FixedAssetLedgerEntry_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixedAssetReconciliationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "ledgerNetValue" REAL NOT NULL DEFAULT 0,
  "glNetValue" REAL NOT NULL DEFAULT 0,
  "differenceAmount" REAL NOT NULL DEFAULT 0,
  "rowsJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixedAssetReconciliationRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssetDisposal_accountSetId_fiscalYear_periodNo_idx" ON "AssetDisposal"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "AssetCount_accountSetId_fiscalYear_periodNo_idx" ON "AssetCount"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "FixedAssetLedgerEntry_accountSetId_fiscalYear_periodNo_idx" ON "FixedAssetLedgerEntry"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "FixedAssetReconciliationRun_accountSetId_fiscalYear_periodNo_idx" ON "FixedAssetReconciliationRun"("accountSetId", "fiscalYear", "periodNo");
