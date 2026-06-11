-- CreateTable
CREATE TABLE "ReportExport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "downloadUrl" TEXT NOT NULL,
  "sensitiveFieldNotice" TEXT,
  "exportedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportExport_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportExport_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiReportInterpretation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "keyFindingsJson" TEXT NOT NULL DEFAULT '[]',
  "warningsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceRefsJson" TEXT NOT NULL DEFAULT '[]',
  "interpretedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiReportInterpretation_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiReportInterpretation_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReportExport_accountSetId_createdAt_idx" ON "ReportExport"("accountSetId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExport_reportRunId_idx" ON "ReportExport"("reportRunId");

-- CreateIndex
CREATE INDEX "AiReportInterpretation_reportRunId_idx" ON "AiReportInterpretation"("reportRunId");

-- CreateIndex
CREATE INDEX "AiReportInterpretation_accountSetId_createdAt_idx" ON "AiReportInterpretation"("accountSetId", "createdAt");
