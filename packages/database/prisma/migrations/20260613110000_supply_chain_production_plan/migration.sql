-- CreateTable
CREATE TABLE "ProductionPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "planNo" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceObjectType" TEXT,
  "sourceObjectId" TEXT,
  "agentActionId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProductionPlan_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPlan_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionPlanLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productionPlanId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "productItemId" TEXT,
  "productItemCode" TEXT NOT NULL,
  "productItemName" TEXT,
  "plannedQuantity" REAL NOT NULL,
  "plannedStartDate" DATETIME,
  "plannedFinishDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'planned',
  CONSTRAINT "ProductionPlanLine_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_accountSetId_planNo_key" ON "ProductionPlan"("accountSetId", "planNo");

-- CreateIndex
CREATE INDEX "ProductionPlan_accountSetId_fiscalYear_periodNo_status_idx" ON "ProductionPlan"("accountSetId", "fiscalYear", "periodNo", "status");

-- CreateIndex
CREATE INDEX "ProductionPlan_agentActionId_idx" ON "ProductionPlan"("agentActionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlanLine_productionPlanId_lineNo_key" ON "ProductionPlanLine"("productionPlanId", "lineNo");
