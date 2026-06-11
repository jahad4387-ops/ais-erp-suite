-- CreateTable
CREATE TABLE "ReportTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "templateCode" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "latestVersionNo" INTEGER NOT NULL DEFAULT 0,
  "publishedVersionId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportTemplate_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportTemplateVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "versionName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effectiveFromPeriod" TEXT,
  "layoutJson" TEXT NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedBy" TEXT,
  "publishedAt" DATETIME,
  CONSTRAINT "ReportTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportSheet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "versionId" TEXT NOT NULL,
  "sheetCode" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "columnCount" INTEGER NOT NULL DEFAULT 0,
  "orderNo" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ReportSheet_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ReportTemplateVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportCell" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sheetId" TEXT NOT NULL,
  "cellAddress" TEXT NOT NULL,
  "label" TEXT,
  "valueType" TEXT NOT NULL DEFAULT 'text',
  "displayFormat" TEXT,
  "isEditable" BOOLEAN NOT NULL DEFAULT true,
  "mergeRef" TEXT,
  "rowNo" INTEGER,
  "columnNo" INTEGER,
  CONSTRAINT "ReportCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "ReportSheet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportFormula" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cellId" TEXT NOT NULL,
  "formulaText" TEXT NOT NULL,
  "astJson" TEXT NOT NULL DEFAULT '{}',
  "dependenciesJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportFormula_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "ReportCell" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_accountSetId_templateCode_key" ON "ReportTemplate"("accountSetId", "templateCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplateVersion_templateId_versionNo_key" ON "ReportTemplateVersion"("templateId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSheet_versionId_sheetCode_key" ON "ReportSheet"("versionId", "sheetCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCell_sheetId_cellAddress_key" ON "ReportCell"("sheetId", "cellAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFormula_cellId_key" ON "ReportFormula"("cellId");
