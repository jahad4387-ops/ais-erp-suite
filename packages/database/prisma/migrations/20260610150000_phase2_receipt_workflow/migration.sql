-- CreateTable
CREATE TABLE "CustomerReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT,
    "customerId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "receiptDate" DATETIME NOT NULL,
    "receiptType" TEXT NOT NULL DEFAULT 'receipt',
    "receivedAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedBy" TEXT NOT NULL,
    "receiptMethod" TEXT,
    "bankAccountCode" TEXT NOT NULL,
    "glVoucherId" TEXT,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerReceipt_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReceipt_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT,
    "customerId" TEXT NOT NULL,
    "sourceNo" TEXT NOT NULL,
    "plannedReceiptDate" DATETIME NOT NULL,
    "plannedAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionPlan_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CollectionPlan_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CollectionPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReceipt_accountSetId_receiptNo_key" ON "CustomerReceipt"("accountSetId", "receiptNo");

-- CreateIndex
CREATE INDEX "CustomerReceipt_accountSetId_status_idx" ON "CustomerReceipt"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "CustomerReceipt_customerId_idx" ON "CustomerReceipt"("customerId");

-- CreateIndex
CREATE INDEX "CustomerReceipt_counterpartyLedgerEntryId_idx" ON "CustomerReceipt"("counterpartyLedgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPlan_counterpartyLedgerEntryId_key" ON "CollectionPlan"("counterpartyLedgerEntryId");

-- CreateIndex
CREATE INDEX "CollectionPlan_accountSetId_status_idx" ON "CollectionPlan"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "CollectionPlan_customerId_idx" ON "CollectionPlan"("customerId");

-- CreateIndex
CREATE INDEX "CollectionPlan_plannedReceiptDate_idx" ON "CollectionPlan"("plannedReceiptDate");
