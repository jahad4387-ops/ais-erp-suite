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
const phase2ArSettlementMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610170000_phase2_ar_settlement_workflow/migration.sql", import.meta.url)
);
const phase2ArSettlementMigrationText = phase2ArSettlementMigrationSql.toString("utf8");
const phase3InventoryFoundationMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610230000_phase3_inventory_foundation/migration.sql", import.meta.url)
);
const phase3InventoryFoundationMigrationText = phase3InventoryFoundationMigrationSql.toString("utf8");
const phase3MovementCostingMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611010000_phase3_movement_costing/migration.sql", import.meta.url)
);
const phase3MovementCostingMigrationText = phase3MovementCostingMigrationSql.toString("utf8");
const phase3ProductionWorkflowMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611020000_phase3_production_workflow/migration.sql", import.meta.url)
);
const phase3ProductionWorkflowMigrationText = phase3ProductionWorkflowMigrationSql.toString("utf8");
const phase3CostAllocationMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611030000_phase3_cost_allocation/migration.sql", import.meta.url)
);
const phase3CostAllocationMigrationText = phase3CostAllocationMigrationSql.toString("utf8");
const phase3VoucherReconciliationMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611040000_phase3_voucher_reconciliation/migration.sql", import.meta.url)
);
const phase3VoucherReconciliationMigrationText = phase3VoucherReconciliationMigrationSql.toString("utf8");
const phase4PayrollFoundationMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611050000_phase4_payroll_foundation/migration.sql", import.meta.url)
);
const phase4PayrollFoundationMigrationText = phase4PayrollFoundationMigrationSql.toString("utf8");
const phase4PayrollWorkflowMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260611060000_phase4_payroll_workflow/migration.sql", import.meta.url)
);
const phase4PayrollWorkflowMigrationText = phase4PayrollWorkflowMigrationSql.toString("utf8");
const phase5ReportTemplateFoundationMigrationText = readMigrationText(
  "../prisma/migrations/20260611100000_phase5_report_template_foundation/migration.sql"
);
const phase5ReportRunSnapshotMigrationText = readMigrationText(
  "../prisma/migrations/20260611110000_phase5_report_run_snapshot/migration.sql"
);
const phase5ReportExportAiMigrationText = readMigrationText(
  "../prisma/migrations/20260611120000_phase5_report_export_ai/migration.sql"
);
const phase5ReportApprovalCashflowMigrationText = readMigrationText(
  "../prisma/migrations/20260611130000_phase5_report_approval_cashflow/migration.sql"
);
const phase6OpsBackupRestoreMigrationText = readMigrationText(
  "../prisma/migrations/20260612090000_phase6_ops_backup_restore/migration.sql"
);
const phase6MigrationJobsMigrationText = readMigrationText(
  "../prisma/migrations/20260612092000_phase6_migration_jobs/migration.sql"
);
const phase6AgentDraftPersistenceMigrationText = readMigrationText(
  "../prisma/migrations/20260612093000_phase6_agent_draft_persistence/migration.sql"
);
const phase6AgentActionPersistenceMigrationText = readMigrationText(
  "../prisma/migrations/20260612100000_phase6_agent_action_persistence/migration.sql"
);
const phase6SecurityEventsMigrationText = readMigrationText(
  "../prisma/migrations/20260612103000_phase6_security_events/migration.sql"
);
const supplyChainProductionPlanMigrationText = readMigrationText(
  "../prisma/migrations/20260613110000_supply_chain_production_plan/migration.sql"
);
const migrationLock = readFileSync(new URL("../prisma/migrations/migration_lock.toml", import.meta.url), "utf8");

function readMigrationText(relativePath) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    assert.fail(`Migration ${relativePath} must exist and be readable: ${error.message}`);
  }
}

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

test("Phase 2 AR settlement migration creates receivable settlement, netting, and voucher draft fields", () => {
  assert.match(phase2ArSettlementMigrationText, /CREATE TABLE "ArSettlement"/, "AR settlements must be persisted.");
  assert.match(
    phase2ArSettlementMigrationText,
    /"settlementType" TEXT NOT NULL/,
    "Settlement type must distinguish receipt, prepayment, credit note, refund, and AR/AP netting."
  );
  assert.match(phase2ArSettlementMigrationText, /"counterpartyLedgerEntryId" TEXT NOT NULL/);
  assert.match(phase2ArSettlementMigrationText, /"customerReceiptId" TEXT/);
  assert.match(phase2ArSettlementMigrationText, /"nettingCounterpartyLedgerEntryId" TEXT/);
  assert.match(phase2ArSettlementMigrationText, /"settledAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase2ArSettlementMigrationText, /"differenceAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase2ArSettlementMigrationText, /"voucherDraftJson" TEXT/);
  assert.match(phase2ArSettlementMigrationText, /CREATE INDEX "ArSettlement_accountSetId_status_idx"/);
  assert.match(phase2ArSettlementMigrationText, /CREATE INDEX "ArSettlement_counterpartyLedgerEntryId_idx"/);
  assert.match(phase2ArSettlementMigrationText, /CREATE INDEX "ArSettlement_nettingCounterpartyLedgerEntryId_idx"/);
});

test("Phase 3 inventory foundation migration creates item, BOM, warehouse, and opening balance structures", () => {
  for (const table of [
    "InventoryItem",
    "InventoryBatch",
    "InventorySerial",
    "Bom",
    "BomLine",
    "Warehouse",
    "WarehouseLocation",
    "InventoryOpeningBalance"
  ]) {
    assert.match(phase3InventoryFoundationMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase3InventoryFoundationMigrationText, /"costMethod" TEXT NOT NULL/, "Inventory items must persist cost method.");
  assert.match(phase3InventoryFoundationMigrationText, /"isBatchManaged" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase3InventoryFoundationMigrationText, /"isManufactured" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase3InventoryFoundationMigrationText, /"scrapRate" REAL NOT NULL DEFAULT 0/, "BOM lines must persist scrap rate.");
  assert.match(phase3InventoryFoundationMigrationText, /"locationId" TEXT/, "Opening balances must support warehouse locations.");
  assert.match(phase3InventoryFoundationMigrationText, /"batchNo" TEXT/, "Opening balances must support batch dimensions.");
  assert.match(phase3InventoryFoundationMigrationText, /CREATE UNIQUE INDEX "InventoryItem_accountSetId_code_key"/);
  assert.match(phase3InventoryFoundationMigrationText, /CREATE UNIQUE INDEX "Warehouse_accountSetId_code_key"/);
  assert.match(phase3InventoryFoundationMigrationText, /CREATE INDEX "InventoryOpeningBalance_accountSetId_itemId_idx"/);
});

test("Phase 3 movement costing migration creates stock movements, balances, cost layers, transfers, and stock counts", () => {
  for (const table of [
    "InventoryMovement",
    "InventoryMovementLine",
    "InventoryBalance",
    "InventoryCostLayer",
    "InventoryTransfer",
    "StockCount",
    "StockCountLine"
  ]) {
    assert.match(phase3MovementCostingMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase3MovementCostingMigrationText, /"costStatus" TEXT NOT NULL DEFAULT 'calculated'/);
  assert.match(phase3MovementCostingMigrationText, /"remainingQuantity" REAL NOT NULL DEFAULT 0/);
  assert.match(phase3MovementCostingMigrationText, /"remainingAmount" REAL NOT NULL DEFAULT 0/);
  assert.match(phase3MovementCostingMigrationText, /"zeroResidualAdjustment" REAL NOT NULL DEFAULT 0/);
  assert.match(phase3MovementCostingMigrationText, /CREATE INDEX "InventoryMovement_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(phase3MovementCostingMigrationText, /CREATE UNIQUE INDEX "InventoryBalance_unique_dimension_key"/);
  assert.match(phase3MovementCostingMigrationText, /CREATE INDEX "InventoryCostLayer_accountSetId_itemId_status_idx"/);
});

test("Phase 3 production workflow migration creates work orders, material requisitions, and product receipts", () => {
  for (const table of ["WorkOrder", "MaterialRequisition", "MaterialRequisitionLine", "ProductReceipt", "ProductReceiptLine"]) {
    assert.match(phase3ProductionWorkflowMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase3ProductionWorkflowMigrationText, /"plannedQuantity" REAL NOT NULL/, "Work orders must persist planned output.");
  assert.match(phase3ProductionWorkflowMigrationText, /"directMaterialCost" REAL NOT NULL DEFAULT 0/, "Work orders must accumulate direct material cost.");
  assert.match(phase3ProductionWorkflowMigrationText, /"sourceMovementId" TEXT NOT NULL/, "Production documents must trace inventory movements.");
  assert.match(phase3ProductionWorkflowMigrationText, /"costStatus" TEXT NOT NULL DEFAULT 'direct_material_only'/, "Product receipts must expose cost status before allocation.");
  assert.match(phase3ProductionWorkflowMigrationText, /CREATE UNIQUE INDEX "WorkOrder_accountSetId_workOrderNo_key"/);
  assert.match(phase3ProductionWorkflowMigrationText, /CREATE INDEX "MaterialRequisition_workOrderId_idx"/);
  assert.match(phase3ProductionWorkflowMigrationText, /CREATE INDEX "ProductReceipt_workOrderId_idx"/);
});

test("Phase 3 cost allocation migration creates mock cost inputs, allocations, allocation lines, and cost adjustments", () => {
  for (const table of ["MockCostInput", "CostAllocation", "CostAllocationLine", "InventoryCostAdjustment"]) {
    assert.match(phase3CostAllocationMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase3CostAllocationMigrationText, /"sourceType" TEXT NOT NULL/, "Cost inputs must distinguish mock, manual, and future Phase 4 sources.");
  assert.match(phase3CostAllocationMigrationText, /"lockedAt" DATETIME/, "Cost inputs must be lockable before committed allocation.");
  assert.match(phase3CostAllocationMigrationText, /"dryRun" BOOLEAN NOT NULL DEFAULT true/, "Allocations must support dry-run mode.");
  assert.match(phase3CostAllocationMigrationText, /"warningCodesJson" TEXT/, "Allocation warnings must persist Phase 4 source limitations.");
  assert.match(phase3CostAllocationMigrationText, /CREATE INDEX "MockCostInput_workOrderId_idx"/);
  assert.match(phase3CostAllocationMigrationText, /CREATE INDEX "InventoryCostAdjustment_accountSetId_itemId_idx"/);
});

test("Phase 3 voucher reconciliation migration creates cost voucher drafts and reconciliation runs", () => {
  for (const table of ["CostVoucherDraft", "InventoryReconciliationRun"]) {
    assert.match(phase3VoucherReconciliationMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase3VoucherReconciliationMigrationText, /"voucherDraftJson" TEXT NOT NULL/, "Cost voucher drafts must keep human-review voucher draft payload.");
  assert.match(phase3VoucherReconciliationMigrationText, /"inventoryBalanceTotal" REAL NOT NULL DEFAULT 0/, "Reconciliation must persist inventory balance total.");
  assert.match(phase3VoucherReconciliationMigrationText, /"differenceAmount" REAL NOT NULL DEFAULT 0/, "Reconciliation must persist difference amount.");
  assert.match(phase3VoucherReconciliationMigrationText, /CREATE INDEX "CostVoucherDraft_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(phase3VoucherReconciliationMigrationText, /CREATE INDEX "InventoryReconciliationRun_accountSetId_fiscalYear_periodNo_idx"/);
});

test("Phase 4 payroll foundation migration creates setup, import, and calculation tables", () => {
  for (const table of [
    "PayrollCategory",
    "PayrollItem",
    "PayrollFormula",
    "EmployeePayrollProfile",
    "PayrollVariableImport",
    "PayrollVariableImportLine",
    "PayrollRun",
    "PayrollRunLine"
  ]) {
    assert.match(phase4PayrollFoundationMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase4PayrollFoundationMigrationText, /"monthlyTaxExemption" REAL NOT NULL DEFAULT 5000/, "Payroll profiles must persist tax base settings.");
  assert.match(phase4PayrollFoundationMigrationText, /"manualAdjustmentAmount" REAL NOT NULL DEFAULT 0/, "Payroll run lines must persist manual tail adjustments.");
  assert.match(phase4PayrollFoundationMigrationText, /"cumulativeTaxableIncome" REAL NOT NULL DEFAULT 0/, "Payroll run lines must persist cumulative monthly tax basis.");
  assert.match(phase4PayrollFoundationMigrationText, /CREATE UNIQUE INDEX "PayrollCategory_accountSetId_code_key"/);
  assert.match(phase4PayrollFoundationMigrationText, /CREATE INDEX "PayrollRun_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(phase4PayrollFoundationMigrationText, /CREATE INDEX "PayrollRunLine_employeeProfileId_idx"/);
});

test("Phase 4 payroll workflow migration creates approval, payment, allocation, and cost-pool outputs", () => {
  for (const table of ["PayrollPaymentFile", "PayrollPaymentFileLine", "PayrollAllocation", "PayrollAllocationLine", "PayrollCostPoolOutput"]) {
    assert.match(phase4PayrollWorkflowMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase4PayrollWorkflowMigrationText, /ALTER TABLE "PayrollRun" ADD COLUMN "approvedAt" DATETIME/, "Payroll runs must persist approval timestamp.");
  assert.match(phase4PayrollWorkflowMigrationText, /ALTER TABLE "PayrollRun" ADD COLUMN "lockedAt" DATETIME/, "Payroll runs must persist lock timestamp.");
  assert.match(phase4PayrollWorkflowMigrationText, /"voucherDraftJson" TEXT NOT NULL/, "Payroll allocations must keep human-review voucher draft payload.");
  assert.match(phase4PayrollWorkflowMigrationText, /"approvalRequired" BOOLEAN NOT NULL DEFAULT true/, "Payroll allocation voucher drafts must require approval.");
  assert.match(phase4PayrollWorkflowMigrationText, /"sourceRunId" TEXT NOT NULL/, "Cost-pool outputs must trace the locked payroll run.");
  assert.match(phase4PayrollWorkflowMigrationText, /"lockedAt" DATETIME NOT NULL/, "Cost-pool outputs must be locked before Phase 3 can consume them.");
  assert.match(phase4PayrollWorkflowMigrationText, /CREATE INDEX "PayrollCostPoolOutput_accountSetId_fiscalYear_periodNo_idx"/);
});

test("Phase 4 fixed asset foundation migration creates categories, methods, cards, and change timelines", () => {
  const migrationText = readMigrationText("../prisma/migrations/20260611070000_phase4_fixed_asset_foundation/migration.sql");

  for (const table of ["AssetCategory", "DepreciationMethod", "FixedAsset", "AssetValueChange", "AssetTransfer"]) {
    assert.match(migrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(migrationText, /"originalValue" REAL NOT NULL/, "Fixed assets must persist original value.");
  assert.match(migrationText, /"accumulatedDepreciation" REAL NOT NULL DEFAULT 0/, "Fixed assets must persist accumulated depreciation.");
  assert.match(migrationText, /"netValue" REAL NOT NULL/, "Fixed assets must persist net value.");
  assert.match(migrationText, /"salvageValue" REAL NOT NULL DEFAULT 0/, "Fixed assets must persist estimated salvage value.");
  assert.match(migrationText, /"serviceStartPeriod" INTEGER NOT NULL/, "Fixed assets must persist the first depreciation period.");
  assert.match(migrationText, /"currentDepartmentId" TEXT NOT NULL/, "Fixed assets must expose month-end department ownership.");
  assert.match(migrationText, /"lastTransferAt" DATETIME/, "Fixed assets must retain the latest transfer date.");
  assert.match(migrationText, /CREATE UNIQUE INDEX "AssetCategory_accountSetId_code_key"/);
  assert.match(migrationText, /CREATE UNIQUE INDEX "FixedAsset_accountSetId_assetNo_key"/);
  assert.match(migrationText, /CREATE INDEX "AssetTransfer_fixedAssetId_transferDate_idx"/);
});

test("Phase 4 depreciation engine migration creates runs, brake fields, and locked cost-pool outputs", () => {
  const migrationText = readMigrationText("../prisma/migrations/20260611080000_phase4_depreciation_engine/migration.sql");

  for (const table of ["DepreciationRun", "DepreciationRunLine", "AssetDepreciationCostPoolOutput"]) {
    assert.match(migrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(migrationText, /ALTER TABLE "FixedAsset" ADD COLUMN "isDepreciationStopped" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migrationText, /ALTER TABLE "FixedAsset" ADD COLUMN "depreciationStoppedAt" DATETIME/);
  assert.match(migrationText, /"dryRun" BOOLEAN NOT NULL DEFAULT true/, "Depreciation runs must support dry-run review.");
  assert.match(migrationText, /"brakeApplied" BOOLEAN NOT NULL DEFAULT false/, "Run lines must persist net-value brake evidence.");
  assert.match(migrationText, /"skippedReason" TEXT/, "Run lines must persist time-line skip reasons.");
  assert.match(migrationText, /"sourceRunId" TEXT NOT NULL/, "Cost-pool outputs must trace locked depreciation runs.");
  assert.match(migrationText, /"lockedAt" DATETIME NOT NULL/, "Cost-pool outputs must be locked before Phase 3 can consume them.");
  assert.match(migrationText, /CREATE INDEX "DepreciationRun_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(migrationText, /CREATE INDEX "AssetDepreciationCostPoolOutput_accountSetId_fiscalYear_periodNo_idx"/);
});

test("Phase 4 fixed asset final migration creates disposal, count, ledger, and reconciliation tables", () => {
  const migrationText = readMigrationText("../prisma/migrations/20260611090000_phase4_asset_disposal_count_reconciliation/migration.sql");

  for (const table of ["AssetDisposal", "AssetCount", "AssetCountLine", "FixedAssetLedgerEntry", "FixedAssetReconciliationRun"]) {
    assert.match(migrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(migrationText, /ALTER TABLE "FixedAsset" ADD COLUMN "disposalDate" DATETIME/);
  assert.match(migrationText, /ALTER TABLE "FixedAsset" ADD COLUMN "depreciationStopPeriod" INTEGER/);
  assert.match(migrationText, /"voucherDraftJson" TEXT NOT NULL/, "Disposal and count documents must preserve human-review voucher drafts.");
  assert.match(migrationText, /"sourceType" TEXT NOT NULL/, "Fixed asset ledger entries must retain business source type.");
  assert.match(migrationText, /"ledgerNetValue" REAL NOT NULL DEFAULT 0/, "Reconciliation must persist fixed asset ledger net value.");
  assert.match(migrationText, /"glNetValue" REAL NOT NULL DEFAULT 0/, "Reconciliation must persist GL comparison value.");
  assert.match(migrationText, /CREATE INDEX "AssetDisposal_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(migrationText, /CREATE INDEX "FixedAssetLedgerEntry_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(migrationText, /CREATE INDEX "FixedAssetReconciliationRun_accountSetId_fiscalYear_periodNo_idx"/);
});

test("Phase 5 report template foundation migration creates UFO template and formula tables", () => {
  for (const table of ["ReportTemplate", "ReportTemplateVersion", "ReportSheet", "ReportCell", "ReportFormula"]) {
    assert.match(
      phase5ReportTemplateFoundationMigrationText,
      new RegExp(`CREATE TABLE "${table}"`),
      `${table} must be created.`
    );
  }

  assert.match(phase5ReportTemplateFoundationMigrationText, /"templateCode" TEXT NOT NULL/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"reportType" TEXT NOT NULL/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"versionNo" INTEGER NOT NULL/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"status" TEXT NOT NULL DEFAULT 'draft'/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"layoutJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"cellAddress" TEXT NOT NULL/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"displayFormat" TEXT/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"isEditable" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"formulaText" TEXT NOT NULL/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"astJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /"dependenciesJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /CREATE UNIQUE INDEX "ReportTemplate_accountSetId_templateCode_key"/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /CREATE UNIQUE INDEX "ReportTemplateVersion_templateId_versionNo_key"/);
  assert.match(phase5ReportTemplateFoundationMigrationText, /CREATE UNIQUE INDEX "ReportCell_sheetId_cellAddress_key"/);
});

test("Phase 5 report run snapshot migration creates run, cell snapshot, and trace-link tables", () => {
  for (const table of ["ReportRun", "ReportRunCell", "ReportTraceLink"]) {
    assert.match(
      phase5ReportRunSnapshotMigrationText,
      new RegExp(`CREATE TABLE "${table}"`),
      `${table} must be created.`
    );
  }

  assert.match(phase5ReportRunSnapshotMigrationText, /"templateVersionId" TEXT NOT NULL/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"includeUnposted" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"snapshotHash" TEXT NOT NULL/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"calculatedValue" REAL NOT NULL DEFAULT 0/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"displayFormat" TEXT/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"traceId" TEXT NOT NULL/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"sourceType" TEXT NOT NULL/);
  assert.match(phase5ReportRunSnapshotMigrationText, /"sourceDocumentId" TEXT/);
  assert.match(phase5ReportRunSnapshotMigrationText, /CREATE INDEX "ReportRun_accountSetId_fiscalYear_periodNo_idx"/);
  assert.match(phase5ReportRunSnapshotMigrationText, /CREATE INDEX "ReportTraceLink_traceId_idx"/);
});

test("Phase 5 report export and AI interpretation migration creates audited export and evidence-backed interpretation tables", () => {
  for (const table of ["ReportExport", "AiReportInterpretation"]) {
    assert.match(phase5ReportExportAiMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }

  assert.match(phase5ReportExportAiMigrationText, /"reportRunId" TEXT NOT NULL/);
  assert.match(phase5ReportExportAiMigrationText, /"fileType" TEXT NOT NULL/);
  assert.match(phase5ReportExportAiMigrationText, /"snapshotHash" TEXT NOT NULL/);
  assert.match(phase5ReportExportAiMigrationText, /"downloadUrl" TEXT NOT NULL/);
  assert.match(phase5ReportExportAiMigrationText, /"sensitiveFieldNotice" TEXT/);
  assert.match(phase5ReportExportAiMigrationText, /"keyFindingsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase5ReportExportAiMigrationText, /"warningsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase5ReportExportAiMigrationText, /"evidenceRefsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase5ReportExportAiMigrationText, /CREATE INDEX "ReportExport_accountSetId_createdAt_idx"/);
  assert.match(phase5ReportExportAiMigrationText, /CREATE INDEX "AiReportInterpretation_reportRunId_idx"/);
});

test("Phase 5 report approval migration creates review queue and exception persistence", () => {
  assert.match(phase5ReportApprovalCashflowMigrationText, /CREATE TABLE "ReportApproval"/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /"reportRunId" TEXT NOT NULL/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /"status" TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /"reviewComment" TEXT/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /"exceptionCount" INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /"exceptionsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /CREATE INDEX "ReportApproval_accountSetId_status_idx"/);
  assert.match(phase5ReportApprovalCashflowMigrationText, /CREATE INDEX "ReportApproval_reportRunId_idx"/);
});

test("Phase 6 Ops backup restore migration creates persistent job tables", () => {
  for (const table of ["BackupJob", "RestoreJob"]) {
    assert.match(phase6OpsBackupRestoreMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }

  assert.match(phase6OpsBackupRestoreMigrationText, /"manifestJson" TEXT NOT NULL/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"attachmentHashVerificationJson" TEXT NOT NULL/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"impactScopeJson" TEXT NOT NULL/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"blockedChannelsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"validationJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"businessMutation" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase6OpsBackupRestoreMigrationText, /"outboundBlocked" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase6OpsBackupRestoreMigrationText, /CREATE INDEX "BackupJob_accountSetId_createdAt_idx"/);
  assert.match(phase6OpsBackupRestoreMigrationText, /CREATE INDEX "RestoreJob_accountSetId_createdAt_idx"/);
  assert.match(phase6OpsBackupRestoreMigrationText, /CREATE INDEX "RestoreJob_sourceBackupJobId_idx"/);
});

test("Phase 6 migration jobs migration creates persistent dry-run job table", () => {
  assert.match(phase6MigrationJobsMigrationText, /CREATE TABLE "MigrationJob"/);
  assert.match(phase6MigrationJobsMigrationText, /"jobType" TEXT NOT NULL/);
  assert.match(phase6MigrationJobsMigrationText, /"targetObjectType" TEXT NOT NULL/);
  assert.match(phase6MigrationJobsMigrationText, /"sourceSummaryJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6MigrationJobsMigrationText, /"fieldMappingJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6MigrationJobsMigrationText, /"sourceRowsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase6MigrationJobsMigrationText, /"validationJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6MigrationJobsMigrationText, /"errorReportJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6MigrationJobsMigrationText, /"businessMutation" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(phase6MigrationJobsMigrationText, /CREATE INDEX "MigrationJob_accountSetId_status_idx"/);
  assert.match(phase6MigrationJobsMigrationText, /CREATE INDEX "MigrationJob_accountSetId_jobType_idx"/);
});

test("Phase 6 Agent draft persistence migration creates candidate and LLM run tables", () => {
  for (const table of ["LlmDraftRun", "AgentDraftCandidate"]) {
    assert.match(phase6AgentDraftPersistenceMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }

  assert.match(phase6AgentDraftPersistenceMigrationText, /"inputSummaryJson" TEXT NOT NULL/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /"sourceContextJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /"draftPayloadJson" TEXT NOT NULL/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /"ocrResultsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /"dryRunResultJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /"llmDraftRunId" TEXT/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /CREATE INDEX "LlmDraftRun_accountSetId_status_idx"/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /CREATE INDEX "LlmDraftRun_accountSetId_draftType_idx"/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /CREATE INDEX "AgentDraftCandidate_accountSetId_status_idx"/);
  assert.match(phase6AgentDraftPersistenceMigrationText, /CREATE INDEX "AgentDraftCandidate_accountSetId_draftType_idx"/);
});

test("Phase 6 Agent action persistence migration creates action approval and replay tables", () => {
  for (const table of ["AgentAction", "AgentApproval", "AgentReplayEvent"]) {
    assert.match(phase6AgentActionPersistenceMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }

  assert.match(phase6AgentActionPersistenceMigrationText, /"approvalPolicyJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"evidenceRefsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"evidenceSnapshotsJson" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"payloadJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"dryRunResultJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"executionResultJson" TEXT/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"reversalResultJson" TEXT/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"approvalProgressJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /"payloadJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6AgentActionPersistenceMigrationText, /CREATE INDEX "AgentAction_accountSetId_status_idx"/);
  assert.match(phase6AgentActionPersistenceMigrationText, /CREATE INDEX "AgentApproval_agentActionId_approvedBy_idx"/);
  assert.match(phase6AgentActionPersistenceMigrationText, /CREATE INDEX "AgentReplayEvent_agentActionId_createdAt_idx"/);
});

test("Phase 6 security events migration creates persistent anomaly audit table", () => {
  assert.match(phase6SecurityEventsMigrationText, /CREATE TABLE "SecurityEvent"/);
  assert.match(phase6SecurityEventsMigrationText, /"accountSetId" TEXT/);
  assert.match(phase6SecurityEventsMigrationText, /"eventType" TEXT NOT NULL/);
  assert.match(phase6SecurityEventsMigrationText, /"severity" TEXT NOT NULL/);
  assert.match(phase6SecurityEventsMigrationText, /"payloadJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(phase6SecurityEventsMigrationText, /CREATE INDEX "SecurityEvent_accountSetId_createdAt_idx"/);
  assert.match(phase6SecurityEventsMigrationText, /CREATE INDEX "SecurityEvent_eventType_severity_idx"/);
  assert.match(phase6SecurityEventsMigrationText, /CREATE INDEX "SecurityEvent_actorId_createdAt_idx"/);
});

test("Supply-chain production plan migration persists Agent-linked plan drafts", () => {
  for (const table of ["ProductionPlan", "ProductionPlanLine"]) {
    assert.match(supplyChainProductionPlanMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(supplyChainProductionPlanMigrationText, /"agentActionId" TEXT/);
  assert.match(supplyChainProductionPlanMigrationText, /"sourceObjectType" TEXT/);
  assert.match(supplyChainProductionPlanMigrationText, /"sourceObjectId" TEXT/);
  assert.match(supplyChainProductionPlanMigrationText, /CREATE UNIQUE INDEX "ProductionPlan_accountSetId_planNo_key"/);
  assert.match(supplyChainProductionPlanMigrationText, /CREATE INDEX "ProductionPlan_agentActionId_idx"/);
});
