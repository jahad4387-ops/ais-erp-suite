import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");

function blockAfter(marker) {
  const start = contract.indexOf(marker);
  assert.notEqual(start, -1, `${marker} must exist in the OpenAPI contract.`);
  const nextPath = contract.indexOf("\n  /", start + marker.length);
  return contract.slice(start, nextPath === -1 ? contract.length : nextPath);
}

test("Phase 1 write endpoints require idempotency and risk metadata", () => {
  const writePaths = [
    "/account-sets:",
    "/account-sets/{accountSetId}:",
    "/account-sets/{accountSetId}/enable:",
    "/account-sets/{accountSetId}/disable:",
    "/account-sets/{accountSetId}/periods/generate:",
    "/periods/{periodId}/open:",
    "/periods/{periodId}/close:",
    "/periods/{periodId}/lock:",
    "/periods/{periodId}/set-current:",
    "/account-code-rules:",
    "/roles:",
    "/users:",
    "/account-sets/{accountSetId}/users:",
    "/partners:",
    "/partners/{partnerId}:",
    "/purchase-orders:",
    "/purchase-orders/{purchaseOrderId}/submit:",
    "/purchase-orders/{purchaseOrderId}/approve:",
    "/purchase-orders/{purchaseOrderId}/close:",
    "/purchase-receipts:",
    "/purchase-invoices:",
    "/sales-orders:",
    "/sales-orders/{salesOrderId}/submit:",
    "/sales-orders/{salesOrderId}/approve:",
    "/sales-orders/{salesOrderId}/close:",
    "/sales-deliveries:",
    "/sales-invoices:",
    "/payment-requests:",
    "/payment-requests/{paymentRequestId}/approve:",
    "/supplier-payments:",
    "/counterparty-ledger/{counterpartyLedgerEntryId}/block-payment:",
    "/customer-receipts:",
    "/ap-settlements:",
    "/ar-settlements:",
    "/accounts:",
    "/accounts/{accountId}:",
    "/accounts/import:",
    "/accounts/{accountId}/disable:",
    "/accounts/{accountId}/enable:",
    "/auxiliary-types:",
    "/auxiliary-items:",
    "/accounts/{accountId}/auxiliary-requirements:",
    "/opening-balances:",
    "/vouchers:",
    "/vouchers/{voucherId}:",
    "/vouchers/{voucherId}/submit:",
    "/vouchers/{voucherId}/approve:",
    "/vouchers/{voucherId}/post:",
    "/vouchers/{voucherId}/copy:",
    "/posting/post-voucher/{voucherId}:",
    "/posting/post-batch:",
    "/posting/period-end/transfer-pl:",
    "/attachments/upload:",
    "/attachment-links:",
    "/attachments/{attachmentId}:",
    "/bank/statements:",
    "/bank/reconcile:",
    "/bank/reconcile/auto:",
    "/ledger/bank-statements/import:",
    "/ledger/bank-reconciliations:",
    "/ledger/bank-reconciliations/{reconciliationId}/match:",
    "/close/profit-loss-carry-forward:",
    "/ai/voucher-suggestions:",
    "/ai/voucher-drafts:",
    "/ai/reconciliation-suggestions:",
    "/ai/collection-drafts:",
    "/ai/exception-checks:",
    "/ai/voucher-drafts/{aiSuggestionId}/convert-to-voucher:",
    "/inventory-items:",
    "/boms:",
    "/warehouses:",
    "/inventory-opening-balances:",
    "/inventory-movements:",
    "/inventory-transfers:",
    "/stock-counts/preview:",
    "/work-orders:",
    "/work-orders/{workOrderId}/release:",
    "/work-orders/{workOrderId}/close:",
    "/material-requisitions:",
    "/product-receipts:",
    "/mock-cost-inputs:",
    "/mock-cost-inputs/{costInputId}/lock:",
    "/cost-allocations/dry-run:",
    "/cost-allocations:",
    "/cost-voucher-drafts:",
    "/asset-categories:",
    "/depreciation-methods:",
    "/fixed-assets:",
    "/asset-transfers:",
    "/asset-value-changes:",
    "/depreciation-runs/dry-run:",
    "/depreciation-runs:",
    "/depreciation-runs/{depreciationRunId}/approve:",
    "/depreciation-runs/{depreciationRunId}/lock:",
    "/asset-disposals:",
    "/asset-counts/preview:",
    "/asset-counts:"
  ];

  for (const path of writePaths) {
    const pathBlock = blockAfter(`  ${path}`);
    assert.match(pathBlock, /Idempotency-Key|IdempotencyKey/, `${path} must require Idempotency-Key.`);
    assert.match(pathBlock, /x-permission:/, `${path} must declare x-permission.`);
    assert.match(pathBlock, /x-risk-level:/, `${path} must declare x-risk-level.`);
    assert.match(pathBlock, /x-agent-allowed:/, `${path} must declare x-agent-allowed.`);
  }
});

test("Phase 1 contract exposes schemas needed by backend, frontend, and Agent tools", () => {
  const requiredSchemas = [
    "AccountSet:",
    "AuthUser:",
    "Permission:",
    "Role:",
    "AccountSetUserGrant:",
    "Partner:",
    "PurchaseOrder:",
    "SalesOrder:",
    "PurchaseReceipt:",
    "SalesDelivery:",
    "PurchaseInvoice:",
    "SalesInvoice:",
    "CounterpartyLedgerEntry:",
    "CounterpartyLedgerSummary:",
    "CounterpartyAgingBucket:",
    "PaymentRequest:",
    "SupplierPayment:",
    "CustomerReceipt:",
    "CollectionPlan:",
    "CreditExposure:",
    "ApSettlement:",
    "ArSettlement:",
    "AccountingPeriod:",
    "Account:",
    "AccountCodeRule:",
    "AuxiliaryType:",
    "AuxiliaryItem:",
    "AccountAuxiliaryRequirement:",
    "OpeningBalance:",
    "OpeningTrialBalance:",
    "Voucher:",
    "VoucherLine:",
    "VoucherStatusLog:",
    "DeploymentConfig:",
    "Attachment:",
    "AttachmentLink:",
    "JournalEntry:",
    "GeneralLedger:",
    "AccountPeriodBalance:",
    "TrialBalance:",
    "AiVoucherSuggestion:",
    "AiReconciliationSuggestion:",
    "AiCollectionDraft:",
    "AiExceptionCheck:",
    "InventoryItem:",
    "Bom:",
    "BomLine:",
    "Warehouse:",
    "WarehouseLocation:",
    "InventoryOpeningBalance:",
    "InventoryOpeningTrialBalance:",
    "InventoryMovement:",
    "InventoryMovementLine:",
    "InventoryBalance:",
    "InventoryCostLayer:",
    "InventoryTransfer:",
    "StockCountPreview:",
    "StockCountLine:",
    "WorkOrder:",
    "MaterialRequisition:",
    "MaterialRequisitionLine:",
    "ProductReceipt:",
    "ProductReceiptLine:",
    "MockCostInput:",
    "CostAllocation:",
    "CostAllocationLine:",
    "InventoryCostAdjustment:",
    "CostVoucherDraft:",
    "InventoryReconciliation:",
    "PayrollCategory:",
    "PayrollItem:",
    "EmployeePayrollProfile:",
    "PayrollVariableImport:",
    "PayrollRun:",
    "PayrollPaymentFile:",
    "PayrollAllocation:",
    "PayrollCostPoolOutput:",
    "AssetCategory:",
    "DepreciationMethod:",
    "FixedAsset:",
    "AssetTransfer:",
    "AssetValueChange:",
    "DepreciationRun:",
    "DepreciationRunLine:",
    "AssetDepreciationCostPoolOutput:",
    "AssetDisposal:",
    "AssetCount:",
    "AssetCountLine:",
    "FixedAssetLedgerEntry:",
    "FixedAssetReconciliation:",
    "AgentAction:",
    "AuditLog:",
    "ErrorResponse:"
  ];

  for (const schema of requiredSchemas) {
    assert.match(contract, new RegExp(`^    ${schema}`, "m"), `${schema} schema must exist.`);
  }
});

test("Phase 2 counterparty ledger endpoint is documented for AP and AR auxiliary mappings", () => {
  const block = blockAfter("  /counterparty-ledger:");
  const summaryBlock = blockAfter("  /counterparty-ledger-summary:");
  const agingBlock = blockAfter("  /counterparty-aging:");

  assert.match(block, /x-permission: counterparty_ledger\.view/);
  assert.match(block, /direction/);
  assert.match(block, /CounterpartyLedgerEntry/);
  assert.match(summaryBlock, /x-permission: counterparty_ledger\.view/);
  assert.match(summaryBlock, /CounterpartyLedgerSummary/);
  assert.match(agingBlock, /x-permission: counterparty_ledger\.view/);
  assert.match(agingBlock, /CounterpartyAgingBucket/);
  assert.match(contract, /glAccountCode:/, "Counterparty ledger schema must expose the mapped GL account.");
  assert.match(contract, /auxiliaryPartnerId:/, "Counterparty ledger schema must expose the mapped auxiliary partner.");
});

test("Phase 2 payment workflow endpoints are documented with freeze control", () => {
  const requestsBlock = blockAfter("  /payment-requests:");
  const approveBlock = blockAfter("  /payment-requests/{paymentRequestId}/approve:");
  const paymentsBlock = blockAfter("  /supplier-payments:");
  const blockPaymentBlock = blockAfter("  /counterparty-ledger/{counterpartyLedgerEntryId}/block-payment:");

  assert.match(requestsBlock, /x-permission: payment_request\.manage/);
  assert.match(requestsBlock, /PaymentRequest/);
  assert.match(approveBlock, /x-permission: payment_request\.manage/);
  assert.match(paymentsBlock, /x-permission: supplier_payment\.manage/);
  assert.match(paymentsBlock, /SupplierPayment/);
  assert.match(blockPaymentBlock, /x-permission: payment_block\.manage/);
  assert.match(blockPaymentBlock, /paymentBlockReason/);
});

test("Phase 2 receipt workflow endpoints are documented with collection and credit views", () => {
  const receiptsBlock = blockAfter("  /customer-receipts:");
  const plansBlock = blockAfter("  /collection-plans:");
  const creditBlock = blockAfter("  /credit-exposures:");

  assert.match(receiptsBlock, /x-permission: customer_receipt\.manage/);
  assert.match(receiptsBlock, /CustomerReceipt/);
  assert.match(contract, /receiptType:/);
  assert.match(plansBlock, /x-permission: collection_plan\.view/);
  assert.match(plansBlock, /CollectionPlan/);
  assert.match(creditBlock, /x-permission: credit_exposure\.view/);
  assert.match(creditBlock, /CreditExposure/);
  assert.match(contract, /availableCredit:/, "Credit exposure schema must expose remaining credit.");
});

test("Phase 2 AP settlement workflow endpoint is documented with difference handling", () => {
  const block = blockAfter("  /ap-settlements:");

  assert.match(block, /x-permission: ap_settlement\.manage/);
  assert.match(block, /ApSettlement/);
  assert.match(contract, /settlementType:/);
  assert.match(contract, /differenceAmount:/);
  assert.match(contract, /differenceReason:/);
});

test("Phase 2 AR settlement workflow endpoint is documented with netting and voucher draft preview", () => {
  const block = blockAfter("  /ar-settlements:");

  assert.match(block, /x-permission: ar_settlement\.manage/);
  assert.match(block, /ArSettlement/);
  assert.match(contract, /nettingCounterpartyLedgerEntryId:/);
  assert.match(contract, /customerReceiptId:/);
  assert.match(contract, /voucherDraft:/);
});

test("Phase 3 inventory foundation endpoints document BOM, warehouses, opening balances, and batch costing guardrails", () => {
  const itemBlock = blockAfter("  /inventory-items:");
  const bomBlock = blockAfter("  /boms:");
  const warehouseBlock = blockAfter("  /warehouses:");
  const openingBlock = blockAfter("  /inventory-opening-balances:");
  const trialBlock = blockAfter("  /inventory-opening-balances/trial-balance:");

  assert.match(itemBlock, /x-permission: inventory_item\.manage/);
  assert.match(itemBlock, /InventoryItem/);
  assert.match(bomBlock, /x-permission: bom\.manage/);
  assert.match(bomBlock, /Bom/);
  assert.match(warehouseBlock, /x-permission: warehouse\.manage/);
  assert.match(warehouseBlock, /Warehouse/);
  assert.match(openingBlock, /x-permission: inventory_balance\.manage/);
  assert.match(openingBlock, /InventoryOpeningBalance/);
  assert.match(trialBlock, /x-permission: inventory_balance\.manage/);
  assert.match(trialBlock, /InventoryOpeningTrialBalance/);
  assert.match(contract, /costMethod:/, "Inventory item schema must expose costMethod.");
  assert.match(contract, /isBatchManaged:/, "Inventory item schema must expose batch management.");
  assert.match(contract, /BATCH_COST_METHOD_CONFLICT/, "Contract must document batch and moving-average mutual exclusion.");
});

test("Phase 3 movement costing endpoints document movements, transfers, stock counts, balances, and cost layers", () => {
  const movementBlock = blockAfter("  /inventory-movements:");
  const balanceBlock = blockAfter("  /inventory-balances:");
  const layerBlock = blockAfter("  /inventory-cost-layers:");
  const transferBlock = blockAfter("  /inventory-transfers:");
  const stockCountPreviewBlock = blockAfter("  /stock-counts/preview:");

  assert.match(movementBlock, /x-permission: inventory_movement\.manage/);
  assert.match(movementBlock, /InventoryMovement/);
  assert.match(balanceBlock, /x-permission: inventory_balance\.manage/);
  assert.match(balanceBlock, /InventoryBalance/);
  assert.match(layerBlock, /x-permission: inventory_balance\.manage/);
  assert.match(layerBlock, /InventoryCostLayer/);
  assert.match(transferBlock, /x-permission: inventory_transfer\.manage/);
  assert.match(transferBlock, /InventoryTransfer/);
  assert.match(stockCountPreviewBlock, /x-permission: stock_count\.manage/);
  assert.match(stockCountPreviewBlock, /StockCountPreview/);
  assert.match(contract, /costBreakdown:/, "Movement line schema must expose FIFO layer cost breakdown.");
  assert.match(contract, /zeroResidualAdjustment:/, "Movement line schema must expose zero-quantity residual adjustment.");
});

test("Phase 3 production workflow endpoints document work orders, material requisitions, and product receipts", () => {
  const workOrderBlock = blockAfter("  /work-orders:");
  const releaseBlock = blockAfter("  /work-orders/{workOrderId}/release:");
  const closeBlock = blockAfter("  /work-orders/{workOrderId}/close:");
  const requisitionBlock = blockAfter("  /material-requisitions:");
  const receiptBlock = blockAfter("  /product-receipts:");

  assert.match(workOrderBlock, /x-permission: work_order\.manage/);
  assert.match(workOrderBlock, /WorkOrder/);
  assert.match(releaseBlock, /x-permission: work_order\.manage/);
  assert.match(closeBlock, /x-permission: work_order\.manage/);
  assert.match(requisitionBlock, /x-permission: material_requisition\.manage/);
  assert.match(requisitionBlock, /MaterialRequisition/);
  assert.match(receiptBlock, /x-permission: product_receipt\.manage/);
  assert.match(receiptBlock, /ProductReceipt/);
  assert.match(contract, /directMaterialCost:/, "Work orders must expose accumulated direct material cost.");
  assert.match(contract, /sourceMovementId:/, "Production documents must expose inventory movement traceability.");
  assert.match(contract, /direct_material_only/, "Product receipts must document pre-allocation cost status.");
});

test("Phase 3 cost allocation endpoints document mock cost inputs, locking, dry-run, and inventory adjustments", () => {
  const inputBlock = blockAfter("  /mock-cost-inputs:");
  const lockBlock = blockAfter("  /mock-cost-inputs/{costInputId}/lock:");
  const dryRunBlock = blockAfter("  /cost-allocations/dry-run:");
  const allocationBlock = blockAfter("  /cost-allocations:");

  assert.match(inputBlock, /x-permission: mock_cost_input\.manage/);
  assert.match(inputBlock, /MockCostInput/);
  assert.match(lockBlock, /x-permission: mock_cost_input\.manage/);
  assert.match(dryRunBlock, /x-permission: cost_allocation\.manage/);
  assert.match(dryRunBlock, /CostAllocation/);
  assert.match(allocationBlock, /x-permission: cost_allocation\.manage/);
  assert.match(allocationBlock, /CostAllocation/);
  assert.match(contract, /PHASE4_SOURCE_MISSING/, "Allocation contract must disclose temporary Phase 4 source limitation.");
  assert.match(contract, /InventoryCostAdjustment/, "Committed allocations must expose inventory cost adjustments.");
});

test("Phase 3 final endpoints document cost voucher drafts and inventory reconciliation", () => {
  const draftBlock = blockAfter("  /cost-voucher-drafts:");
  const reconciliationBlock = blockAfter("  /inventory-reconciliation:");

  assert.match(draftBlock, /x-permission: cost_voucher\.manage/);
  assert.match(draftBlock, /CostVoucherDraft/);
  assert.match(reconciliationBlock, /x-permission: inventory_reconciliation\.view/);
  assert.match(reconciliationBlock, /InventoryReconciliation/);
  assert.match(contract, /approvalRequired:/, "Cost voucher drafts must require human approval.");
  assert.match(contract, /differenceAmount:/, "Inventory reconciliation must expose differences.");
});

test("Phase 4 payroll foundation endpoints document setup, variable import, and calculation contracts", () => {
  const categoryBlock = blockAfter("  /payroll-categories:");
  const itemBlock = blockAfter("  /payroll-items:");
  const profileBlock = blockAfter("  /employee-payroll-profiles:");
  const importBlock = blockAfter("  /payroll-variable-imports:");
  const runBlock = blockAfter("  /payroll-runs/calculate:");

  assert.match(categoryBlock, /x-permission: payroll_setup\.manage/);
  assert.match(categoryBlock, /PayrollCategory/);
  assert.match(itemBlock, /PayrollItem/);
  assert.match(profileBlock, /EmployeePayrollProfile/);
  assert.match(importBlock, /x-permission: payroll_run\.manage/);
  assert.match(importBlock, /PayrollVariableImport/);
  assert.match(runBlock, /x-permission: payroll_run\.manage/);
  assert.match(runBlock, /PayrollRun/);
  assert.match(contract, /manualAdjustmentAmount:/, "Payroll run lines must expose manual adjustments.");
  assert.match(contract, /cumulativeTaxableIncome:/, "Payroll run lines must expose cumulative tax basis.");
});

test("Phase 4 payroll workflow endpoints document approval, locking, payment, allocation, and cost-pool outputs", () => {
  const approveBlock = blockAfter("  /payroll-runs/{payrollRunId}/approve:");
  const lockBlock = blockAfter("  /payroll-runs/{payrollRunId}/lock:");
  const paymentBlock = blockAfter("  /payroll-payment-files:");
  const allocationBlock = blockAfter("  /payroll-allocations:");
  const costPoolBlock = blockAfter("  /payroll-cost-pools:");

  assert.match(approveBlock, /x-permission: payroll_run\.manage/);
  assert.match(lockBlock, /x-permission: payroll_run\.manage/);
  assert.match(paymentBlock, /x-permission: payroll_payment\.manage/);
  assert.match(paymentBlock, /PayrollPaymentFile/);
  assert.match(allocationBlock, /x-permission: payroll_allocation\.manage/);
  assert.match(allocationBlock, /PayrollAllocation/);
  assert.match(costPoolBlock, /x-permission: payroll_cost_pool\.view/);
  assert.match(costPoolBlock, /PayrollCostPoolOutput/);
  assert.match(contract, /phase4_payroll_allocation/, "Payroll allocations must identify their voucher source.");
  assert.match(contract, /sourceRunId:/, "Cost pools must trace the locked payroll run.");
  assert.match(contract, /lockedAt:/, "Cost pools must expose lock status.");
});

test("Phase 4 fixed asset foundation endpoints document setup, cards, transfers, and value changes", () => {
  const categoryBlock = blockAfter("  /asset-categories:");
  const methodBlock = blockAfter("  /depreciation-methods:");
  const fixedAssetBlock = blockAfter("  /fixed-assets:");
  const transferBlock = blockAfter("  /asset-transfers:");
  const valueChangeBlock = blockAfter("  /asset-value-changes:");

  assert.match(categoryBlock, /x-permission: fixed_asset_setup\.manage/);
  assert.match(categoryBlock, /AssetCategory/);
  assert.match(methodBlock, /x-permission: fixed_asset_setup\.manage/);
  assert.match(methodBlock, /DepreciationMethod/);
  assert.match(fixedAssetBlock, /x-permission: fixed_asset_card\.manage/);
  assert.match(fixedAssetBlock, /FixedAsset/);
  assert.match(transferBlock, /x-permission: fixed_asset_transfer\.manage/);
  assert.match(transferBlock, /AssetTransfer/);
  assert.match(valueChangeBlock, /x-permission: fixed_asset_card\.manage/);
  assert.match(valueChangeBlock, /AssetValueChange/);
  assert.match(contract, /serviceStartPeriod:/, "Fixed assets must expose the first depreciation period.");
  assert.match(contract, /new_asset_next_month/, "Fixed assets must document the new-asset depreciation timeline rule.");
  assert.match(contract, /month_end_department/, "Fixed asset transfers must document month-end department ownership.");
});

test("Phase 4 depreciation engine endpoints document dry-run, brake, locking, and cost-pool outputs", () => {
  const dryRunBlock = blockAfter("  /depreciation-runs/dry-run:");
  const runBlock = blockAfter("  /depreciation-runs:");
  const approveBlock = blockAfter("  /depreciation-runs/{depreciationRunId}/approve:");
  const lockBlock = blockAfter("  /depreciation-runs/{depreciationRunId}/lock:");
  const costPoolBlock = blockAfter("  /asset-depreciation-cost-pools:");

  assert.match(dryRunBlock, /x-permission: fixed_asset_depreciation\.manage/);
  assert.match(dryRunBlock, /DepreciationRun/);
  assert.match(runBlock, /x-permission: fixed_asset_depreciation\.manage/);
  assert.match(runBlock, /DepreciationRun/);
  assert.match(approveBlock, /x-permission: fixed_asset_depreciation\.manage/);
  assert.match(lockBlock, /x-permission: fixed_asset_depreciation\.manage/);
  assert.match(costPoolBlock, /x-permission: fixed_asset_depreciation_pool\.view/);
  assert.match(costPoolBlock, /AssetDepreciationCostPoolOutput/);
  assert.match(contract, /NEW_ASSET_NOT_STARTED/, "Depreciation dry-run must document new asset timeline skips.");
  assert.match(contract, /brakeApplied:/, "Depreciation run lines must expose net-value brake evidence.");
  assert.match(contract, /fixed_asset_depreciation/, "Cost pools must identify fixed asset depreciation source type.");
});

test("Phase 4 fixed asset final endpoints document disposal, count, ledger, and reconciliation", () => {
  const disposalBlock = blockAfter("  /asset-disposals:");
  const countPreviewBlock = blockAfter("  /asset-counts/preview:");
  const countBlock = blockAfter("  /asset-counts:");
  const ledgerBlock = blockAfter("  /fixed-asset-ledger:");
  const reconciliationBlock = blockAfter("  /fixed-asset-reconciliation:");

  assert.match(disposalBlock, /x-permission: fixed_asset_disposal\.manage/);
  assert.match(disposalBlock, /AssetDisposal/);
  assert.match(countPreviewBlock, /x-permission: fixed_asset_count\.manage/);
  assert.match(countPreviewBlock, /AssetCount/);
  assert.match(countBlock, /x-permission: fixed_asset_count\.manage/);
  assert.match(countBlock, /AssetCount/);
  assert.match(ledgerBlock, /x-permission: fixed_asset_reconciliation\.view/);
  assert.match(ledgerBlock, /FixedAssetLedgerEntry/);
  assert.match(reconciliationBlock, /x-permission: fixed_asset_reconciliation\.view/);
  assert.match(reconciliationBlock, /FixedAssetReconciliation/);
  assert.match(contract, /phase4_asset_disposal/, "Asset disposal must identify its voucher source.");
  assert.match(contract, /phase4_asset_count/, "Asset count must identify its voucher source.");
  assert.match(contract, /DISPOSED_BEFORE_PERIOD/, "Depreciation must document post-disposal stopping.");
});

test("Phase 4 month-end integration documents formal cost-pool consumption by Phase 3 allocations", () => {
  const dryRunBlock = blockAfter("  /cost-allocations/dry-run:");
  const allocationBlock = blockAfter("  /cost-allocations:");

  assert.match(dryRunBlock, /phase4CostPoolIds/);
  assert.match(allocationBlock, /phase4CostPoolIds/);
  assert.match(contract, /phase4_payroll_cost_pool/);
  assert.match(contract, /phase4_depreciation_cost_pool/);
});

test("deployment configuration check endpoint is documented", () => {
  const block = blockAfter("  /deployment/config:");

  assert.match(block, /summary: Inspect deployment configuration/);
  assert.match(block, /x-permission: account_set.view/);
  assert.match(block, /DeploymentConfig/);
});

test("account-set user grants are documented for scoped authorization", () => {
  const accountSetBlock = blockAfter("  /account-sets/{accountSetId}:");
  const grantBlock = blockAfter("  /account-sets/{accountSetId}/users:");

  assert.match(accountSetBlock, /get:/);
  assert.match(accountSetBlock, /patch:/);
  assert.match(accountSetBlock, /UpdateAccountSetRequest/);
  assert.match(accountSetBlock, /AccountSet/);
  assert.match(accountSetBlock, /x-permission: account_set.manage/);
  assert.match(grantBlock, /GrantAccountSetUserRequest/);
  assert.match(grantBlock, /AccountSetUserGrant/);
  assert.match(grantBlock, /x-permission: account_set_user.manage/);
});

test("auxiliary and opening balance endpoints document initialization contracts", () => {
  const accountSetPeriodsBlock = blockAfter("  /account-sets/{accountSetId}/periods:");
  const auxiliaryTypesBlock = blockAfter("  /auxiliary-types:");
  const auxiliaryItemsBlock = blockAfter("  /auxiliary-items:");
  const auxiliaryItemBlock = blockAfter("  /auxiliary-items/{auxiliaryItemId}:");
  const requirementsBlock = blockAfter("  /accounts/{accountId}/auxiliary-requirements:");
  const openingBalancesBlock = blockAfter("  /opening-balances:");
  const openingTrialBlock = blockAfter("  /opening-balances/trial-balance:");

  assert.match(accountSetPeriodsBlock, /AccountingPeriod/);
  assert.match(accountSetPeriodsBlock, /x-permission: period.view/);
  assert.match(auxiliaryTypesBlock, /CreateAuxiliaryTypeRequest/);
  assert.match(auxiliaryTypesBlock, /AuxiliaryType/);
  assert.match(auxiliaryItemsBlock, /CreateAuxiliaryItemRequest/);
  assert.match(auxiliaryItemsBlock, /AuxiliaryItem/);
  assert.match(auxiliaryItemBlock, /patch:/);
  assert.match(auxiliaryItemBlock, /delete:/);
  assert.match(auxiliaryItemBlock, /AuxiliaryItem/);
  assert.match(requirementsBlock, /SaveAccountAuxiliaryRequirementRequest/);
  assert.match(requirementsBlock, /AccountAuxiliaryRequirement/);
  assert.match(openingBalancesBlock, /SaveOpeningBalanceRequest/);
  assert.match(openingBalancesBlock, /OpeningBalance/);
  assert.match(openingTrialBlock, /OpeningTrialBalance/);
});

test("RBAC endpoints document permission, role, and user management contracts", () => {
  const permissionsBlock = blockAfter("  /permissions:");
  const rolesBlock = blockAfter("  /roles:");
  const roleBlock = blockAfter("  /roles/{roleId}:");
  const usersBlock = blockAfter("  /users:");
  const userBlock = blockAfter("  /users/{userId}:");

  assert.match(permissionsBlock, /Permission/, "Permissions endpoint must return permission codes.");
  assert.match(rolesBlock, /CreateRoleRequest/, "Roles endpoint must accept role creation.");
  assert.match(rolesBlock, /Role/, "Roles endpoint must return roles.");
  assert.match(roleBlock, /UpdateRoleRequest/, "Role detail endpoint must accept role updates.");
  assert.match(roleBlock, /Role/, "Role detail endpoint must return the updated role.");
  assert.match(usersBlock, /CreateUserRequest/, "Users endpoint must accept user creation.");
  assert.match(usersBlock, /AuthUser/, "Users endpoint must return sanitized users.");
  assert.match(userBlock, /delete:/, "User detail endpoint must support deletion.");
  assert.match(userBlock, /AuthUser/, "User detail endpoint must return deleted user metadata.");
});

test("attachment endpoints document upload, linking, status, and posted-voucher delete protection", () => {
  const uploadBlock = blockAfter("  /attachments/upload:");
  const linkBlock = blockAfter("  /attachment-links:");
  const voucherAttachmentsBlock = blockAfter("  /vouchers/{voucherId}/attachments:");
  const statusBlock = blockAfter("  /attachments/{attachmentId}/status:");
  const contentBlock = blockAfter("  /attachments/{attachmentId}/content:");
  const deleteBlock = blockAfter("  /attachments/{attachmentId}:");

  assert.match(uploadBlock, /UploadAttachmentRequest/, "Upload endpoint must reference its request schema.");
  assert.match(uploadBlock, /Attachment/, "Upload endpoint must return an Attachment.");
  assert.match(contract, /contentBase64/, "Upload schema must document binary content transport.");
  assert.match(contract, /storageProvider/, "Upload response must expose the storage provider.");
  assert.match(linkBlock, /CreateAttachmentLinkRequest/, "Link endpoint must reference its request schema.");
  assert.match(voucherAttachmentsBlock, /Attachment/, "Voucher attachment list must return attachments.");
  assert.match(statusBlock, /AttachmentStatus/, "Status endpoint must return attachment status.");
  assert.match(contentBlock, /AttachmentContent/, "Content endpoint must return stored attachment content.");
  assert.match(deleteBlock, /POSTED_VOUCHER_ATTACHMENT_DELETE_BLOCKED|Posted voucher attachments cannot be deleted/);
});

test("Agent-facing endpoints expose dry-run and evidence fields", () => {
  const aiBlock = blockAfter("  /ai/voucher-suggestions:");
  const planAiBlock = blockAfter("  /ai/voucher-drafts:");
  const reconciliationBlock = blockAfter("  /ai/reconciliation-suggestions:");
  const collectionBlock = blockAfter("  /ai/collection-drafts:");
  const exceptionBlock = blockAfter("  /ai/exception-checks:");
  const planAiDetailBlock = blockAfter("  /ai/voucher-drafts/{aiSuggestionId}:");
  const planAiConvertBlock = blockAfter("  /ai/voucher-drafts/{aiSuggestionId}/convert-to-voucher:");
  const agentBlock = blockAfter("  /agent-actions:");

  assert.match(aiBlock, /CreateAiVoucherSuggestionRequest/, "AI endpoint must reference its request schema.");
  assert.match(aiBlock, /AiVoucherSuggestion/, "AI endpoint must reference its response schema.");
  assert.match(planAiBlock, /CreateAiVoucherSuggestionRequest/, "Plan AI draft endpoint must accept the AI suggestion request.");
  assert.match(planAiBlock, /AiVoucherSuggestion/, "Plan AI draft endpoint must return an AI draft suggestion.");
  assert.match(reconciliationBlock, /CreateAiReconciliationSuggestionRequest/);
  assert.match(reconciliationBlock, /AiReconciliationSuggestion/);
  assert.match(collectionBlock, /CreateAiCollectionDraftRequest/);
  assert.match(collectionBlock, /AiCollectionDraft/);
  assert.match(exceptionBlock, /CreateAiExceptionCheckRequest/);
  assert.match(exceptionBlock, /AiExceptionCheck/);
  assert.match(planAiDetailBlock, /AiVoucherSuggestion/, "Plan AI draft detail endpoint must return an AI draft suggestion.");
  assert.match(planAiConvertBlock, /ConvertAiVoucherSuggestionRequest/, "Plan AI draft conversion endpoint must document human review.");
  assert.match(planAiConvertBlock, /Voucher/, "Plan AI draft conversion endpoint must return the formal voucher draft.");
  assert.match(agentBlock, /CreateAgentActionRequest/, "Agent endpoint must reference its request schema.");
  assert.match(agentBlock, /AgentAction/, "Agent endpoint must reference its response schema.");
  assert.match(contract, /name: Idempotency-Key/, "Idempotency-Key header must be defined.");
  assert.match(contract, /dryRun/, "Agent-facing schemas must expose dryRun.");
  assert.match(contract, /evidenceRefs/, "Agent-facing schemas must expose evidenceRefs.");
  assert.match(contract, /approvalRequired/, "AI suggestions must expose approvalRequired.");
});

test("audit log endpoint is documented with permission metadata", () => {
  const auditBlock = blockAfter("  /audit-logs:");

  assert.match(auditBlock, /x-permission: audit_log.view/, "Audit log endpoint must require audit_log.view.");
  assert.match(auditBlock, /x-risk-level: low/, "Audit log endpoint must be query-only low risk.");
  assert.match(auditBlock, /AuditLog/, "Audit log endpoint must return AuditLog records.");
});

test("auxiliary accounting fields are documented", () => {
  assert.match(contract, /requiredAuxiliaries/, "Account schemas must expose requiredAuxiliaries.");
  assert.match(contract, /auxiliaries/, "Voucher line schema must expose auxiliaries.");
  assert.match(contract, /auxiliarySnapshot/, "Journal entries must preserve auxiliary snapshots.");
});

test("Phase 1 ledger and voucher trace endpoints are documented", () => {
  const generalLedgerBlock = blockAfter("  /ledger/general-ledger:");
  const accountBalancesBlock = blockAfter("  /ledger/account-balances:");
  const subLedgerBlock = blockAfter("  /ledger/sub-ledger:");
  const reportBalancesBlock = blockAfter("  /reports/account-balances:");
  const reportTrialBalanceBlock = blockAfter("  /reports/trial-balance:");
  const voucherBlock = blockAfter("  /vouchers/{voucherId}:");
  const voucherCopyBlock = blockAfter("  /vouchers/{voucherId}/copy:");
  const voucherLogsBlock = blockAfter("  /vouchers/{voucherId}/status-logs:");
  const postingVoucherBlock = blockAfter("  /posting/post-voucher/{voucherId}:");
  const postingBatchBlock = blockAfter("  /posting/post-batch:");
  const postingBatchesBlock = blockAfter("  /posting/batches:");
  const postingBatchDetailBlock = blockAfter("  /posting/batches/{postingBatchId}:");

  assert.match(generalLedgerBlock, /GeneralLedger/, "General ledger endpoint must return the general ledger schema.");
  assert.match(accountBalancesBlock, /AccountPeriodBalance/, "Account balances endpoint must return balance rows.");
  assert.match(subLedgerBlock, /JournalEntry/, "Plan sub-ledger endpoint must return journal entries.");
  assert.match(reportBalancesBlock, /AccountPeriodBalance/, "Plan account balances report must return balance rows.");
  assert.match(reportTrialBalanceBlock, /TrialBalance/, "Plan trial balance report must return trial balance.");
  assert.match(voucherBlock, /get:/, "Voucher detail endpoint must be documented.");
  assert.match(voucherBlock, /patch:/, "Voucher update endpoint must be documented.");
  assert.match(voucherBlock, /delete:/, "Voucher delete endpoint must be documented.");
  assert.match(voucherBlock, /UpdateVoucherRequest/, "Voucher update endpoint must document the request schema.");
  assert.match(voucherBlock, /x-permission: voucher.update_own/, "Voucher update/delete must require update permission.");
  assert.match(voucherCopyBlock, /CopyVoucherRequest/, "Voucher copy endpoint must document the request schema.");
  assert.match(voucherCopyBlock, /Voucher/, "Voucher copy endpoint must return a voucher.");
  assert.match(voucherLogsBlock, /VoucherStatusLog/, "Voucher status log endpoint must return state transition logs.");
  assert.match(postingVoucherBlock, /PostVoucherResponse/, "Plan single-voucher posting endpoint must return a posting result.");
  assert.match(postingBatchBlock, /CreatePostingBatchRequest/, "Batch posting endpoint must document the request schema.");
  assert.match(postingBatchBlock, /PostingBatch/, "Batch posting endpoint must return the batch schema.");
  assert.match(postingBatchesBlock, /PostingBatch/, "Posting batch list endpoint must return batch rows.");
  assert.match(postingBatchDetailBlock, /PostingBatch/, "Posting batch detail endpoint must return one batch row.");
});

test("account import and disable endpoints document master-data controls", () => {
  const treeBlock = blockAfter("  /accounts/tree:");
  const updateBlock = blockAfter("  /accounts/{accountId}:");
  const importBlock = blockAfter("  /accounts/import:");
  const disableBlock = blockAfter("  /accounts/{accountId}/disable:");
  const enableBlock = blockAfter("  /accounts/{accountId}/enable:");

  assert.match(treeBlock, /AccountTreeNode/);
  assert.match(updateBlock, /get:/);
  assert.match(updateBlock, /UpdateAccountRequest/);
  assert.match(updateBlock, /Account/);
  assert.match(updateBlock, /delete:/);
  assert.match(updateBlock, /x-permission: account.delete/);
  assert.match(importBlock, /ImportAccountsRequest/);
  assert.match(importBlock, /Account/);
  assert.match(disableBlock, /Account/);
  assert.match(disableBlock, /x-permission: account.update/);
  assert.match(enableBlock, /Account/);
  assert.match(enableBlock, /x-permission: account.update/);
});

test("bank reconciliation endpoints document statement import and matching contracts", () => {
  const importBlock = blockAfter("  /ledger/bank-statements/import:");
  const statementsBlock = blockAfter("  /ledger/bank-statements:");
  const planStatementsBlock = blockAfter("  /bank/statements:");
  const planReconcileBlock = blockAfter("  /bank/reconcile:");
  const planAutoReconcileBlock = blockAfter("  /bank/reconcile/auto:");
  const reconciliationBlock = blockAfter("  /ledger/bank-reconciliations:");
  const matchBlock = blockAfter("  /ledger/bank-reconciliations/{reconciliationId}/match:");

  assert.match(contract, /isBank/, "Account schemas must expose bank account markers.");
  assert.match(importBlock, /ImportBankStatementsRequest/);
  assert.match(importBlock, /BankStatement/);
  assert.match(statementsBlock, /BankStatement/);
  assert.match(planStatementsBlock, /ImportBankStatementsRequest/);
  assert.match(planStatementsBlock, /BankStatement/);
  assert.match(planReconcileBlock, /CreateBankReconciliationRequest/);
  assert.match(planReconcileBlock, /BankReconciliation/);
  assert.match(planAutoReconcileBlock, /CreateBankReconciliationRequest/);
  assert.match(planAutoReconcileBlock, /BankReconciliationMatchResult/);
  assert.match(reconciliationBlock, /CreateBankReconciliationRequest/);
  assert.match(reconciliationBlock, /BankReconciliation/);
  assert.match(matchBlock, /BankReconciliationMatchResult/);
});

test("period close endpoints document profit and loss carry-forward contracts", () => {
  const carryForwardBlock = blockAfter("  /close/profit-loss-carry-forward:");
  const planCarryForwardBlock = blockAfter("  /posting/period-end/transfer-pl:");

  assert.match(carryForwardBlock, /CreateProfitLossCarryForwardRequest/);
  assert.match(carryForwardBlock, /Voucher/);
  assert.match(planCarryForwardBlock, /CreateProfitLossCarryForwardRequest/);
  assert.match(planCarryForwardBlock, /Voucher/);
  assert.match(contract, /period_close/, "Voucher source types must include period_close.");
});
