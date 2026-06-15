ALTER TABLE "WorkOrder" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "WorkOrder" ADD COLUMN "productionPlanId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "productionPlanLineId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "agentActionId" TEXT;

CREATE INDEX "WorkOrder_productionPlanId_idx" ON "WorkOrder"("productionPlanId");
CREATE INDEX "WorkOrder_agentActionId_idx" ON "WorkOrder"("agentActionId");
