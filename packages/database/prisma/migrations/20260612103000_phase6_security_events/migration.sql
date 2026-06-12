-- CreateTable
CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT,
  "eventType" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "actorId" TEXT,
  "source" TEXT NOT NULL,
  "objectType" TEXT,
  "objectId" TEXT,
  "message" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SecurityEvent_accountSetId_createdAt_idx" ON "SecurityEvent"("accountSetId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_severity_idx" ON "SecurityEvent"("eventType", "severity");

-- CreateIndex
CREATE INDEX "SecurityEvent_actorId_createdAt_idx" ON "SecurityEvent"("actorId", "createdAt");
