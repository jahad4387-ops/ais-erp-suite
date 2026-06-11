-- CreateTable
CREATE TABLE "ReportRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "includeUnposted" BOOLEAN NOT NULL DEFAULT false,
  "runMode" TEXT NOT NULL DEFAULT 'formal',
  "status" TEXT NOT NULL DEFAULT 'calculated',
  "snapshotHash" TEXT NOT NULL,
  "paramsJson" TEXT NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recalculatedAt" DATETIME,
  "lockedBy" TEXT,
  "lockedAt" DATETIME,
  CONSTRAINT "ReportRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRun_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ReportTemplateVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportRunCell" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportRunId" TEXT NOT NULL,
  "sheetCode" TEXT NOT NULL,
  "cellAddress" TEXT NOT NULL,
  "label" TEXT,
  "formulaText" TEXT,
  "calculatedValue" REAL NOT NULL DEFAULT 0,
  "displayFormat" TEXT,
  "traceId" TEXT NOT NULL,
  CONSTRAINT "ReportRunCell_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportTraceLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportRunId" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceDocumentId" TEXT,
  "accountCode" TEXT,
  "fiscalYear" INTEGER,
  "periodNo" INTEGER,
  "amount" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "ReportTraceLink_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReportRun_accountSetId_fiscalYear_periodNo_idx" ON "ReportRun"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRunCell_reportRunId_sheetCode_cellAddress_key" ON "ReportRunCell"("reportRunId", "sheetCode", "cellAddress");

-- CreateIndex
CREATE INDEX "ReportRunCell_traceId_idx" ON "ReportRunCell"("traceId");

-- CreateIndex
CREATE INDEX "ReportTraceLink_traceId_idx" ON "ReportTraceLink"("traceId");

-- CreateIndex
CREATE INDEX "ReportTraceLink_reportRunId_idx" ON "ReportTraceLink"("reportRunId");
