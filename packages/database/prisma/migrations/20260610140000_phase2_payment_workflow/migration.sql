-- AlterTable
ALTER TABLE "CounterpartyLedgerEntry" ADD COLUMN "isPaymentBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CounterpartyLedgerEntry" ADD COLUMN "paymentBlockReason" TEXT;

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "requestDate" DATETIME NOT NULL,
    "plannedPaymentDate" DATETIME,
    "requestedAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "approvalComment" TEXT,
    "paymentMethod" TEXT,
    "bankAccountCode" TEXT NOT NULL,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentRequest_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "counterpartyLedgerEntryId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "paidBy" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "bankAccountCode" TEXT NOT NULL,
    "glVoucherId" TEXT,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierPayment_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_counterpartyLedgerEntryId_fkey" FOREIGN KEY ("counterpartyLedgerEntryId") REFERENCES "CounterpartyLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_accountSetId_requestNo_key" ON "PaymentRequest"("accountSetId", "requestNo");

-- CreateIndex
CREATE INDEX "PaymentRequest_accountSetId_status_idx" ON "PaymentRequest"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_counterpartyLedgerEntryId_idx" ON "PaymentRequest"("counterpartyLedgerEntryId");

-- CreateIndex
CREATE INDEX "PaymentRequest_supplierId_idx" ON "PaymentRequest"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_accountSetId_paymentNo_key" ON "SupplierPayment"("accountSetId", "paymentNo");

-- CreateIndex
CREATE INDEX "SupplierPayment_accountSetId_status_idx" ON "SupplierPayment"("accountSetId", "status");

-- CreateIndex
CREATE INDEX "SupplierPayment_paymentRequestId_idx" ON "SupplierPayment"("paymentRequestId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");
