import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("../prisma/migrations/20260607120000_phase1_init/migration.sql", import.meta.url)
);
const migrationText = migrationSql.toString("utf8");
const phase2PartnerMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610090000_phase2_partner_master_data/migration.sql", import.meta.url)
);
const phase2PartnerMigrationText = phase2PartnerMigrationSql.toString("utf8");
const phase2OrderMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610100000_phase2_order_workflow/migration.sql", import.meta.url)
);
const phase2OrderMigrationText = phase2OrderMigrationSql.toString("utf8");
const phase2FulfillmentMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610110000_phase2_fulfillment_workflow/migration.sql", import.meta.url)
);
const phase2FulfillmentMigrationText = phase2FulfillmentMigrationSql.toString("utf8");
const phase2InvoiceMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610120000_phase2_invoice_confirmation/migration.sql", import.meta.url)
);
const phase2InvoiceMigrationText = phase2InvoiceMigrationSql.toString("utf8");
const phase2CounterpartyLedgerMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610130000_phase2_counterparty_ledger/migration.sql", import.meta.url)
);
const phase2CounterpartyLedgerMigrationText = phase2CounterpartyLedgerMigrationSql.toString("utf8");
const phase2PaymentMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610140000_phase2_payment_workflow/migration.sql", import.meta.url)
);
const phase2PaymentMigrationText = phase2PaymentMigrationSql.toString("utf8");
const phase2ReceiptMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610150000_phase2_receipt_workflow/migration.sql", import.meta.url)
);
const phase2ReceiptMigrationText = phase2ReceiptMigrationSql.toString("utf8");
const phase2ApSettlementMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610160000_phase2_ap_settlement_workflow/migration.sql", import.meta.url)
);
const phase2ApSettlementMigrationText = phase2ApSettlementMigrationSql.toString("utf8");
const migrationLock = readFileSync(new URL("../prisma/migrations/migration_lock.toml", import.meta.url), "utf8");

test("Phase 1 migration is UTF-8 SQL, not UTF-16 PowerShell output", () => {
  assert.notDeepEqual([...migrationSql.subarray(0, 2)], [0xff, 0xfe], "migration.sql must not be UTF-16 LE.");
  assert.match(migrationText, /^﻿?-- CreateTable/, "migration.sql must start with SQL text.");
});

test("Phase 1 migration creates required accounting tables", () => {
  const requiredTables = [
    "AccountSet",
    "User",
    "Role",
    "Permission",
    "AccountingPeriod",
    "ChartOfAccount",
    "AuxiliaryType",
    "AuxiliaryItem",
    "Voucher",
    "VoucherLine",
    "VoucherStatusLog",
    "Attachment",
    "PostingBatch",
    "JournalEntry",
    "AccountPeriodBalance",
    "BankStatement",
    "AuditLog"
  ];

  for (const table of requiredTables) {
    assert.match(migrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created by migration.sql.`);
  }

  assert.match(migrationText, /"revision" INTEGER NOT NULL DEFAULT 1/, "Voucher revision must be persisted for optimistic locking.");
});

test("Phase 1 migration lock targets SQLite", () => {
  assert.match(migrationLock, /provider = "sqlite"/);
});

test("User persistence stores password hashes instead of plaintext passwords", () => {
  assert.match(migrationText, /"passwordHash" TEXT NOT NULL/, "User table must persist passwordHash.");
  assert.doesNotMatch(migrationText, /"password" TEXT NOT NULL/, "User table must not persist plaintext password.");
});

test("Phase 2 partner migration creates account-set scoped partner master data", () => {
  assert.match(phase2PartnerMigrationText, /CREATE TABLE "Partner"/, "Partner table must be created.");
  assert.match(phase2PartnerMigrationText, /"partnerType" TEXT NOT NULL/, "Partner type must be persisted.");
  assert.match(phase2PartnerMigrationText, /"paymentTerms" TEXT/, "Payment terms must be persisted.");
  assert.match(phase2PartnerMigrationText, /"settlementMethod" TEXT/, "Settlement method must be persisted.");
  assert.match(
    phase2PartnerMigrationText,
    /CREATE UNIQUE INDEX "Partner_accountSetId_code_key"/,
    "Partner code must be unique inside an account set."
  );
});

test("Phase 2 order migration creates purchase and sales order workflows", () => {
  for (const table of ["PurchaseOrder", "PurchaseOrderLine", "SalesOrder", "SalesOrderLine"]) {
    assert.match(phase2OrderMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2OrderMigrationText, /"status" TEXT NOT NULL DEFAULT 'draft'/, "Orders must persist status.");
  assert.match(phase2OrderMigrationText, /"totalAmount" REAL NOT NULL DEFAULT 0/, "Orders must persist totals.");
  assert.match(
    phase2OrderMigrationText,
    /CREATE UNIQUE INDEX "PurchaseOrder_accountSetId_orderNo_key"/,
    "Purchase order number must be unique inside an account set."
  );
  assert.match(
    phase2OrderMigrationText,
    /CREATE UNIQUE INDEX "SalesOrder_accountSetId_orderNo_key"/,
    "Sales order number must be unique inside an account set."
  );
});

test("Phase 2 fulfillment migration creates purchase receipt and sales delivery source chains", () => {
  for (const table of ["PurchaseReceipt", "PurchaseReceiptLine", "SalesDelivery", "SalesDeliveryLine"]) {
    assert.match(phase2FulfillmentMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2FulfillmentMigrationText, /"purchaseOrderId" TEXT NOT NULL/, "Purchase receipts must keep source order ids.");
  assert.match(phase2FulfillmentMigrationText, /"salesOrderId" TEXT NOT NULL/, "Sales deliveries must keep source order ids.");
  assert.match(phase2FulfillmentMigrationText, /"evidenceRefsJson" TEXT/, "Fulfillment documents must retain evidence refs.");
  assert.match(
    phase2FulfillmentMigrationText,
    /CREATE UNIQUE INDEX "PurchaseReceipt_accountSetId_receiptNo_key"/,
    "Purchase receipt numbers must be unique inside an account set."
  );
  assert.match(
    phase2FulfillmentMigrationText,
    /CREATE UNIQUE INDEX "SalesDelivery_accountSetId_deliveryNo_key"/,
    "Sales delivery numbers must be unique inside an account set."
  );
});

test("Phase 2 invoice migration creates payable and receivable confirmation documents", () => {
  for (const table of ["PurchaseInvoice", "PurchaseInvoiceLine", "SalesInvoice", "SalesInvoiceLine"]) {
    assert.match(phase2InvoiceMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2InvoiceMigrationText, /"invoiceSource" TEXT NOT NULL DEFAULT 'manual'/, "Invoice source must support OCR/import/manual confirmation.");
  assert.match(phase2InvoiceMigrationText, /"estimatedDifference" REAL NOT NULL DEFAULT 0/, "Purchase invoices must retain estimated variance.");
  assert.match(phase2InvoiceMigrationText, /"payableAmount" REAL NOT NULL DEFAULT 0/, "Purchase invoices must confirm AP amount.");
  assert.match(phase2InvoiceMigrationText, /"receivableAmount" REAL NOT NULL DEFAULT 0/, "Sales invoices must confirm AR amount.");
  assert.match(phase2InvoiceMigrationText, /CREATE UNIQUE INDEX "PurchaseInvoice_accountSetId_invoiceNo_key"/);
  assert.match(phase2InvoiceMigrationText, /CREATE UNIQUE INDEX "SalesInvoice_accountSetId_invoiceNo_key"/);
});

test("Phase 2 counterparty ledger migration maps AP and AR to GL auxiliary dimensions", () => {
  assert.match(
    phase2CounterpartyLedgerMigrationText,
    /CREATE TABLE "CounterpartyLedgerEntry"/,
    "Counterparty ledger entries must be persisted."
  );
  assert.match(phase2CounterpartyLedgerMigrationText, /"direction" TEXT NOT NULL/, "Entry direction must distinguish AP and AR.");
  assert.match(
    phase2CounterpartyLedgerMigrationText,
    /"sourceType" TEXT NOT NULL/,
    "Entries must retain purchase_invoice or sales_invoice source type."
  );
  assert.match(phase2CounterpartyLedgerMigrationText, /"remainingAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase2CounterpartyLedgerMigrationText, /"glAccountCode" TEXT NOT NULL/);
  assert.match(phase2CounterpartyLedgerMigrationText, /"auxiliaryType" TEXT NOT NULL/);
  assert.match(phase2CounterpartyLedgerMigrationText, /"auxiliaryPartnerId" TEXT NOT NULL/);
  assert.match(phase2CounterpartyLedgerMigrationText, /CREATE INDEX "CounterpartyLedgerEntry_accountSetId_direction_status_idx"/);
  assert.match(phase2CounterpartyLedgerMigrationText, /CREATE INDEX "CounterpartyLedgerEntry_partnerId_idx"/);
});

test("Phase 2 payment migration creates request, approval, payment, and freeze controls", () => {
  assert.match(phase2PaymentMigrationText, /ALTER TABLE "CounterpartyLedgerEntry" ADD COLUMN "isPaymentBlocked" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase2PaymentMigrationText, /ALTER TABLE "CounterpartyLedgerEntry" ADD COLUMN "paymentBlockReason" TEXT/);
  for (const table of ["PaymentRequest", "SupplierPayment"]) {
    assert.match(phase2PaymentMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2PaymentMigrationText, /"counterpartyLedgerEntryId" TEXT NOT NULL/, "Payment requests must keep the payable source.");
  assert.match(phase2PaymentMigrationText, /"status" TEXT NOT NULL DEFAULT 'pending_approval'/, "Payment requests must start pending approval.");
  assert.match(phase2PaymentMigrationText, /"approvedBy" TEXT/, "Payment approval actor must be persisted.");
  assert.match(phase2PaymentMigrationText, /"paymentRequestId" TEXT NOT NULL/, "Supplier payments must point back to an approved request.");
  assert.match(phase2PaymentMigrationText, /"bankAccountCode" TEXT NOT NULL/, "Payments must capture the cash or bank account.");
  assert.match(phase2PaymentMigrationText, /CREATE INDEX "PaymentRequest_accountSetId_status_idx"/);
  assert.match(phase2PaymentMigrationText, /CREATE INDEX "SupplierPayment_accountSetId_status_idx"/);
});

test("Phase 2 receipt migration creates customer receipts and collection plans", () => {
  for (const table of ["CustomerReceipt", "CollectionPlan"]) {
    assert.match(phase2ReceiptMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2ReceiptMigrationText, /"counterpartyLedgerEntryId" TEXT/, "Receipts and plans must optionally point to AR entries.");
  assert.match(phase2ReceiptMigrationText, /"receiptType" TEXT NOT NULL DEFAULT 'receipt'/, "Receipts must distinguish normal receipts and prepayments.");
  assert.match(phase2ReceiptMigrationText, /"bankAccountCode" TEXT NOT NULL/, "Receipts must capture the cash or bank account.");
  assert.match(phase2ReceiptMigrationText, /"plannedReceiptDate" DATETIME NOT NULL/, "Collection plans must retain planned receipt dates.");
  assert.match(phase2ReceiptMigrationText, /"plannedAmount" REAL NOT NULL DEFAULT 0/, "Collection plans must retain planned amounts.");
  assert.match(phase2ReceiptMigrationText, /CREATE INDEX "CustomerReceipt_accountSetId_status_idx"/);
  assert.match(phase2ReceiptMigrationText, /CREATE INDEX "CollectionPlan_accountSetId_status_idx"/);
});

test("Phase 2 AP settlement migration creates payable settlement source chain and difference fields", () => {
  assert.match(phase2ApSettlementMigrationText, /CREATE TABLE "ApSettlement"/, "AP settlements must be persisted.");
  assert.match(
    phase2ApSettlementMigrationText,
    /"settlementType" TEXT NOT NULL/,
    "Settlement type must distinguish payment, prepayment, credit note, refund, and netting."
  );
  assert.match(phase2ApSettlementMigrationText, /"counterpartyLedgerEntryId" TEXT NOT NULL/);
  assert.match(phase2ApSettlementMigrationText, /"supplierPaymentId" TEXT/);
  assert.match(phase2ApSettlementMigrationText, /"settledAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase2ApSettlementMigrationText, /"differenceAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase2ApSettlementMigrationText, /"differenceReason" TEXT/);
  assert.match(phase2ApSettlementMigrationText, /CREATE INDEX "ApSettlement_accountSetId_status_idx"/);
  assert.match(phase2ApSettlementMigrationText, /CREATE INDEX "ApSettlement_counterpartyLedgerEntryId_idx"/);
});
