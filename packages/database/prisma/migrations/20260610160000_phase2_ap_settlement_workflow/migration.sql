-- CreateTable
CREATE TABLE "ApSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT NOT NULL,
    "supplierPaymentId" TEXT,
    "settlementNo" TEXT NOT NULL,
    "settlementDate" DATETIME NOT NULL,
    "settlementType" TEXT NOT NULL,
    "settledAmount" REAL NOT NULL DEFAULT 0,
    "differenceAmount" REAL NOT NULL DEFAULT 0,
    "differenceReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'settled',
    "createdBy" TEXT NOT NULL,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApSettlement_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApSettlement_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApSettlement_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApSettlement_accountSetId_settlementNo_key" ON "ApSettlement"("accountSetId", "settlementNo");

-- CreateIndex
CREATE INDEX "ApSettlement_accountSetId_status_idx" ON "ApSettlement"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "ApSettlement_counterpartyLedgerEntryId_idx" ON "ApSettlement"("counterpartyLedgerEntryId");

-- CreateIndex
CREATE INDEX "ApSettlement_supplierId_idx" ON "ApSettlement"("supplierId");

-- CreateIndex
CREATE INDEX "ApSettlement_supplierPaymentId_idx" ON "ApSettlement"("supplierPaymentId");
