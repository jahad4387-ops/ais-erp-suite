-- CreateTable
CREATE TABLE "CounterpartyLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceNo" TEXT NOT NULL,
    "documentDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "originalAmount" REAL NOT NULL DEFAULT 0,
    "settledAmount" REAL NOT NULL DEFAULT 0,
    "remainingAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "glAccountCode" TEXT NOT NULL,
    "auxiliaryType" TEXT NOT NULL,
    "auxiliaryPartnerId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CounterpartyLedgerEntry_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CounterpartyLedgerEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CounterpartyLedgerEntry_sourceType_sourceId_key" ON "CounterpartyLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CounterpartyLedgerEntry_accountSetId_direction_status_idx" ON "CounterpartyLedgerEntry"("accountSetId", "direction", "status");

-- CreateIndex
CREATE INDEX "CounterpartyLedgerEntry_partnerId_idx" ON "CounterpartyLedgerEntry"("partnerId");

-- CreateIndex
CREATE INDEX "CounterpartyLedgerEntry_dueDate_idx" ON "CounterpartyLedgerEntry"("dueDate");
