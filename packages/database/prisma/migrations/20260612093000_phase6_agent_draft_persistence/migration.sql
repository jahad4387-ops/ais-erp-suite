-- CreateTable
CREATE TABLE "LlmDraftRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "draftType" TEXT NOT NULL,
  "sourceObjectType" TEXT,
  "sourceObjectId" TEXT,
  "inputSummaryJson" TEXT NOT NULL,
  "outputSchema" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LlmDraftRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentDraftCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fiscalPeriodId" TEXT,
  "draftType" TEXT NOT NULL,
  "sourceObjectType" TEXT,
  "sourceObjectId" TEXT,
  "userInstruction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "riskLevel" TEXT NOT NULL,
  "requiresHumanConfirmation" BOOLEAN NOT NULL DEFAULT true,
  "confidence" REAL NOT NULL DEFAULT 0,
  "sourceContextJson" TEXT NOT NULL DEFAULT '{}',
  "matchedMasterDataJson" TEXT NOT NULL DEFAULT '[]',
  "unmatchedItemsJson" TEXT NOT NULL DEFAULT '[]',
  "draftPayloadJson" TEXT NOT NULL,
  "ocrResultsJson" TEXT NOT NULL DEFAULT '[]',
  "dryRunResultJson" TEXT NOT NULL DEFAULT '{}',
  "warningsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceRefsJson" TEXT NOT NULL DEFAULT '[]',
  "llmDraftRunId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "reviewedAt" DATETIME,
  "rejectedBy" TEXT,
  "rejectedAt" DATETIME,
  "rejectionReason" TEXT,
  "convertedObjectType" TEXT,
  "convertedObjectId" TEXT,
  "resolvedUnmatchedItemsJson" TEXT NOT NULL DEFAULT '[]',
  CONSTRAINT "AgentDraftCandidate_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AgentDraftCandidate_llmDraftRunId_fkey" FOREIGN KEY ("llmDraftRunId") REFERENCES "LlmDraftRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LlmDraftRun_accountSetId_status_idx" ON "LlmDraftRun"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "LlmDraftRun_accountSetId_draftType_idx" ON "LlmDraftRun"("accountSetId", "draftType");

-- CreateIndex
CREATE INDEX "LlmDraftRun_createdAt_idx" ON "LlmDraftRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentDraftCandidate_accountSetId_status_idx" ON "AgentDraftCandidate"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "AgentDraftCandidate_accountSetId_draftType_idx" ON "AgentDraftCandidate"("accountSetId", "draftType");

-- CreateIndex
CREATE INDEX "AgentDraftCandidate_llmDraftRunId_idx" ON "AgentDraftCandidate"("llmDraftRunId");
