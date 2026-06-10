-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "receiptDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "totalQuantity" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseReceipt_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "PurchaseReceiptLine_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deliveryNo" TEXT NOT NULL,
    "deliveryDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "totalQuantity" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "evidenceRefsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesDelivery_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesDelivery_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesDeliveryLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesDeliveryId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "SalesDeliveryLine_salesDeliveryId_fkey" FOREIGN KEY ("salesDeliveryId") REFERENCES "SalesDelivery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesDeliveryLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_accountSetId_receiptNo_key" ON "PurchaseReceipt"("accountSetId", "receiptNo");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_idx" ON "PurchaseReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_supplierId_idx" ON "PurchaseReceipt"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_purchaseReceiptId_lineNo_key" ON "PurchaseReceiptLine"("purchaseReceiptId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDelivery_accountSetId_deliveryNo_key" ON "SalesDelivery"("accountSetId", "deliveryNo");

-- CreateIndex
CREATE INDEX "SalesDelivery_salesOrderId_idx" ON "SalesDelivery"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesDelivery_customerId_idx" ON "SalesDelivery"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDeliveryLine_salesDeliveryId_lineNo_key" ON "SalesDeliveryLine"("salesDeliveryId", "lineNo");
