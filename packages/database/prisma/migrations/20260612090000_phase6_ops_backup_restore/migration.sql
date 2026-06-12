-- CreateTable
CREATE TABLE "BackupJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "backupType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "businessMutation" BOOLEAN NOT NULL DEFAULT false,
  "includeAttachments" BOOLEAN NOT NULL DEFAULT true,
  "retentionDays" INTEGER,
  "requestedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "snapshotRef" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "manifestJson" TEXT NOT NULL,
  "attachmentHashVerificationJson" TEXT NOT NULL,
  CONSTRAINT "BackupJob_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestoreJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "sourceBackupJobId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "restoreMode" TEXT NOT NULL,
  "targetEnvironment" TEXT NOT NULL,
  "restorePointLabel" TEXT,
  "requestedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "businessMutation" BOOLEAN NOT NULL DEFAULT false,
  "outboundBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedChannelsJson" TEXT NOT NULL DEFAULT '[]',
  "impactScopeJson" TEXT NOT NULL,
  "validationJson" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "RestoreJob_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RestoreJob_sourceBackupJobId_fkey" FOREIGN KEY ("sourceBackupJobId") REFERENCES "BackupJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BackupJob_accountSetId_createdAt_idx" ON "BackupJob"("accountSetId", "createdAt");

-- CreateIndex
CREATE INDEX "RestoreJob_accountSetId_createdAt_idx" ON "RestoreJob"("accountSetId", "createdAt");

-- CreateIndex
CREATE INDEX "RestoreJob_sourceBackupJobId_idx" ON "RestoreJob"("sourceBackupJobId");
