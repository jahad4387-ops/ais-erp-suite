-- CreateTable
CREATE TABLE "ArSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT NOT NULL,
    "customerReceiptId" TEXT,
    "nettingCounterpartyLedgerEntryId" TEXT,
    "settlementNo" TEXT NOT NULL,
    "settlementDate" DATETIME NOT NULL,
    "settlementType" TEXT NOT NULL,
    "settledAmount" REAL NOT NULL DEFAULT 0,
    "differenceAmount" REAL NOT NULL DEFAULT 0,
    "differenceReason" TEXT,
    "voucherDraftJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'settled',
    "createdBy" TEXT NOT NULL,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArSettlement_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArSettlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArSettlement_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArSettlement_customerReceiptId_fkey" FOREIGN KEY ("customerReceiptId") REFERENCES "CustomerReceipt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ArSettlement_nettingCounterpartyLedgerEntryId_fkey" FOREIGN KEY ("nettingCounterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ArSettlement_accountSetId_settlementNo_key" ON "ArSettlement"("accountSetId", "settlementNo");

-- CreateIndex
CREATE INDEX "ArSettlement_accountSetId_status_idx" ON "ArSettlement"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "ArSettlement_counterpartyLedgerEntryId_idx" ON "ArSettlement"("counterpartyLedgerEntryId");

-- CreateIndex
CREATE INDEX "ArSettlement_customerId_idx" ON "ArSettlement"("customerId");

-- CreateIndex
CREATE INDEX "ArSettlement_customerReceiptId_idx" ON "ArSettlement"("customerReceiptId");

-- CreateIndex
CREATE INDEX "ArSettlement_nettingCounterpartyLedgerEntryId_idx" ON "ArSettlement"("nettingCounterpartyLedgerEntryId");
