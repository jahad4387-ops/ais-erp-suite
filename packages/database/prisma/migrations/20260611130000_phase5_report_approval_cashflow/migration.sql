-- CreateTable
CREATE TABLE "ReportApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "submittedBy" TEXT NOT NULL,
  "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "rejectedBy" TEXT,
  "rejectedAt" DATETIME,
  "reviewComment" TEXT,
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "exceptionsJson" TEXT NOT NULL DEFAULT '[]',
  CONSTRAINT "ReportApproval_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportApproval_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReportApproval_accountSetId_status_idx" ON "ReportApproval"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "ReportApproval_reportRunId_idx" ON "ReportApproval"("reportRunId");
