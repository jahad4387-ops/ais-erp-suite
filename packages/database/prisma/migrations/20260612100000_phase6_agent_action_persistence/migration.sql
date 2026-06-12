-- CreateTable
CREATE TABLE "AgentAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "riskLevel" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
  "approvalPolicyJson" TEXT NOT NULL DEFAULT '{}',
  "evidenceRefsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceSnapshotsJson" TEXT NOT NULL DEFAULT '[]',
  "payloadJson" TEXT NOT NULL DEFAULT '{}',
  "requestedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dryRunResultJson" TEXT NOT NULL DEFAULT '{}',
  "approvalRequestJson" TEXT,
  "approvalProgressJson" TEXT NOT NULL DEFAULT '{}',
  "executionResultJson" TEXT,
  "reversalResultJson" TEXT,
  CONSTRAINT "AgentAction_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentActionId" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvalComment" TEXT,
  CONSTRAINT "AgentApproval_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentReplayEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentActionId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentReplayEvent_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentAction_accountSetId_status_idx" ON "AgentAction"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "AgentAction_accountSetId_riskLevel_idx" ON "AgentAction"("accountSetId", "riskLevel");

-- CreateIndex
CREATE INDEX "AgentAction_toolName_idx" ON "AgentAction"("toolName");

-- CreateIndex
CREATE INDEX "AgentApproval_agentActionId_approvedBy_idx" ON "AgentApproval"("agentActionId", "approvedBy");

-- CreateIndex
CREATE INDEX "AgentReplayEvent_agentActionId_createdAt_idx" ON "AgentReplayEvent"("agentActionId", "createdAt");
