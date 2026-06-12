-- CreateTable
CREATE TABLE "MigrationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "targetObjectType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "businessMutation" BOOLEAN NOT NULL DEFAULT false,
  "requestedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "sourceSummaryJson" TEXT NOT NULL DEFAULT '{}',
  "fieldMappingJson" TEXT NOT NULL DEFAULT '{}',
  "sourceRowsJson" TEXT NOT NULL DEFAULT '[]',
  "validationJson" TEXT NOT NULL DEFAULT '{}',
  "errorReportJson" TEXT NOT NULL DEFAULT '{}',
  "importSummaryJson" TEXT,
  CONSTRAINT "MigrationJob_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MigrationJob_accountSetId_status_idx" ON "MigrationJob"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "MigrationJob_accountSetId_jobType_idx" ON "MigrationJob"("accountSetId", "jobType");

-- CreateIndex
CREATE INDEX "MigrationJob_createdAt_idx" ON "MigrationJob"("createdAt");
