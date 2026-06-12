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

function schemaBlock(marker, nextMarker) {
  const start = contract.indexOf(marker);
  assert.notEqual(start, -1, `${marker} must exist in the OpenAPI contract.`);
  const end = nextMarker ? contract.indexOf(nextMarker, start + marker.length) : -1;
  assert.notEqual(end, -1, `${nextMarker} must exist after ${marker}.`);
  return contract.slice(start, end);
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
    "/asset-counts:",
    "/report-templates:",
    "/report-templates/{reportTemplateId}/versions:",
    "/report-template-versions/{reportTemplateVersionId}/publish:",
    "/report-runs:",
    "/report-runs/{reportRunId}/recalculate:",
    "/report-runs/{reportRunId}/lock:",
    "/report-runs/{reportRunId}/submit-review:",
    "/report-approvals/{reportApprovalId}/approve:",
    "/report-runs/{reportRunId}/exports:",
    "/report-runs/{reportRunId}/interpretations:",
    "/agent/draft-candidates:",
    "/agent/draft-candidates/{agentDraftCandidateId}/convert:",
    "/agent/draft-candidates/{agentDraftCandidateId}/reject:",
    "/ai/ocr-preview:",
    "/ai/llm-draft-runs:",
    "/agent-actions/{agentActionId}/submit:",
    "/agent-actions/{agentActionId}/approve:",
    "/agent-actions/{agentActionId}/execute:",
    "/agent-actions/{agentActionId}/reverse:"
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
    "InventoryMovementDraft:",
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
    "ReportTemplate:",
    "ReportTemplateVersion:",
    "ReportSheet:",
    "ReportCell:",
    "ReportFormula:",
    "ReportRun:",
    "ReportRunCell:",
    "ReportTraceLink:",
    "ReportExport:",
    "AiReportInterpretation:",
    "AgentTool:",
    "InvokeAgentToolRequest:",
    "AgentToolInvocationResult:",
    "AgentAction:",
    "AgentActionQueue:",
    "AgentActionQueueItem:",
    "ExecuteAgentActionRequest:",
    "ReverseAgentActionRequest:",
    "AgentApprovalProgress:",
    "AgentEvidenceSnapshot:",
    "AgentActionReplay:",
    "AgentDraftCandidate:",
    "AgentDraftCandidateQueue:",
    "AgentDraftCandidateQueueItem:",
    "AgentDraftResolvedUnmatchedItem:",
    "AgentDraftSourceContext:",
    "AgentDraftSourceObject:",
    "OcrPreview:",
    "AgentDraftOcrResult:",
    "AgentMasterDataDraft:",
    "AgentPayrollAllocationDraft:",
    "AgentAssetChangeDraft:",
    "AgentReportInterpretationDraft:",
    "ConvertAgentDraftCandidateRequest:",
    "RejectAgentDraftCandidateRequest:",
    "LlmDraftRun:",
    "LlmDraftMetrics:",
    "LlmDraftProviderMetric:",
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
  assert.match(contract, /draft_pending_cost/, "Product receipt drafts must document pending-cost status before posting.");
  assert.match(contract, /enum: \[draft, posted\]/, "Production documents must document draft and posted statuses.");
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

test("Phase 5 report template endpoints document UFO designer foundation and formula dependencies", () => {
  const templatesBlock = blockAfter("  /report-templates:");
  const statutoryPresetsBlock = blockAfter("  /report-templates/statutory-presets:");
  const versionsBlock = blockAfter("  /report-templates/{reportTemplateId}/versions:");
  const publishBlock = blockAfter("  /report-template-versions/{reportTemplateVersionId}/publish:");
  const versionDetailBlock = blockAfter("  /report-template-versions/{reportTemplateVersionId}:");

  assert.match(templatesBlock, /x-permission: report\.view/);
  assert.match(templatesBlock, /x-permission: report_template\.manage/);
  assert.match(templatesBlock, /CreateReportTemplateRequest/);
  assert.match(templatesBlock, /ReportTemplate/);
  assert.match(statutoryPresetsBlock, /x-permission: report_template\.manage/);
  assert.match(statutoryPresetsBlock, /CreateStatutoryReportPresetsRequest/);
  assert.match(statutoryPresetsBlock, /StatutoryReportPresetsResult/);
  assert.match(versionsBlock, /x-permission: report_template\.manage/);
  assert.match(versionsBlock, /CreateReportTemplateVersionRequest/);
  assert.match(versionsBlock, /ReportTemplateVersion/);
  assert.match(publishBlock, /x-permission: report_template\.manage/);
  assert.match(publishBlock, /ReportTemplateVersion/);
  assert.match(versionDetailBlock, /x-permission: report\.view/);
  assert.match(versionDetailBlock, /ReportTemplateVersion/);
  assert.match(contract, /formulaText:/);
  assert.match(contract, /astJson:/);
  assert.match(contract, /dependenciesJson:/);
  assert.match(contract, /displayFormat:/);
  assert.match(contract, /isEditable:/);
  assert.match(contract, /BAL\(\)/);
  assert.match(contract, /AMT\(\)/);
  assert.match(contract, /OPENING\(\)/);
  assert.match(contract, /CLOSING\(\)/);
  assert.match(contract, /AUX_BAL\(\)/);
  assert.match(contract, /STAT-BS/);
  assert.match(contract, /STAT-IS/);
  assert.match(contract, /STAT-CF/);
  assert.match(contract, /STAT-OE/);
});

test("Phase 5 report run endpoints document formula snapshots, closed-period block, and trace links", () => {
  const runsBlock = blockAfter("  /report-runs:");
  const detailBlock = blockAfter("  /report-runs/{reportRunId}:");
  const drilldownBlock = blockAfter("  /report-runs/{reportRunId}/cells/{cellAddress}/drilldown:");
  const recalculateBlock = blockAfter("  /report-runs/{reportRunId}/recalculate:");
  const lockBlock = blockAfter("  /report-runs/{reportRunId}/lock:");
  const submitReviewBlock = blockAfter("  /report-runs/{reportRunId}/submit-review:");
  const approvalsBlock = blockAfter("  /report-approvals:");
  const approveBlock = blockAfter("  /report-approvals/{reportApprovalId}/approve:");

  assert.match(runsBlock, /x-permission: report\.view/);
  assert.match(runsBlock, /x-permission: report_run\.manage/);
  assert.match(runsBlock, /CreateReportRunRequest/);
  assert.match(runsBlock, /ReportRun/);
  assert.match(detailBlock, /x-permission: report\.view/);
  assert.match(drilldownBlock, /x-permission: report\.view/);
  assert.match(drilldownBlock, /ReportRunCellDrilldown/);
  assert.match(recalculateBlock, /x-permission: report_run\.manage/);
  assert.match(lockBlock, /x-permission: report_run\.manage/);
  assert.match(submitReviewBlock, /x-permission: report_approval\.manage/);
  assert.match(submitReviewBlock, /ReportApproval/);
  assert.match(approvalsBlock, /x-permission: report\.view/);
  assert.match(approveBlock, /x-permission: report_approval\.manage/);
  assert.match(contract, /includeUnposted:/);
  assert.match(contract, /calculatedValue:/);
  assert.match(contract, /snapshotHash:/);
  assert.match(contract, /renderMode:/);
  assert.match(contract, /traceLinks:/);
  assert.match(contract, /report_cell/);
  assert.match(contract, /sourceCell:/);
  assert.match(contract, /sheetCode:/);
  assert.match(contract, /cellAddress:/);
  assert.match(contract, /sourceBalances:/);
  assert.match(contract, /ledgerEntries:/);
  assert.match(contract, /vouchers:/);
  assert.match(contract, /REPORT_PERIOD_CLOSED/);
  assert.match(contract, /REPORT_RUN_LOCKED/);
  assert.match(contract, /REPORT_CASH_FLOW_UNASSIGNED/);
  assert.match(contract, /ReportApprovalException/);
  assert.match(contract, /未分配异常现金流/);
});

test("Phase 5 export and AI interpretation endpoints document audit history and evidence references", () => {
  const exportsBlock = blockAfter("  /report-runs/{reportRunId}/exports:");
  const exportListBlock = blockAfter("  /report-exports:");
  const interpretationBlock = blockAfter("  /report-runs/{reportRunId}/interpretations:");
  const interpretationListBlock = blockAfter("  /ai-report-interpretations:");

  assert.match(exportsBlock, /x-permission: report_export\.manage/);
  assert.match(exportsBlock, /CreateReportExportRequest/);
  assert.match(exportsBlock, /ReportExport/);
  assert.match(exportListBlock, /x-permission: report\.view/);
  assert.match(interpretationBlock, /x-permission: report_interpretation\.manage/);
  assert.match(interpretationBlock, /CreateAiReportInterpretationRequest/);
  assert.match(interpretationBlock, /AiReportInterpretation/);
  assert.match(interpretationListBlock, /x-permission: report\.view/);
  assert.match(contract, /keyFindings:/);
  assert.match(contract, /warnings:/);
  assert.match(contract, /evidenceRefs:/);
  assert.match(contract, /report_cell:BS!B12/);
  assert.match(contract, /sensitiveFieldNotice:/);
  assert.match(contract, /contentText:/);
  assert.match(contract, /stored report cells/);
});

test("Phase 5 management analysis endpoint documents metrics, warnings, and drilldowns", () => {
  const analysisBlock = blockAfter("  /management-analysis:");

  assert.match(analysisBlock, /summary: Build Phase 5 management analysis metrics/);
  assert.match(analysisBlock, /x-permission: report\.view/);
  assert.match(analysisBlock, /ManagementAnalysis/);
  assert.match(contract, /ManagementAnalysisMetric/);
  assert.match(contract, /ManagementAnalysisWarning/);
  assert.match(contract, /purchaseTrend/);
  assert.match(contract, /salesGrossMargin/);
  assert.match(contract, /inventoryTurnover/);
  assert.match(contract, /counterpartyAging/);
  assert.match(contract, /cashFlow/);
  assert.match(contract, /laborCost/);
  assert.match(contract, /depreciationCost/);
  assert.match(contract, /operatingOverview/);
  assert.match(contract, /OVERDUE_AR/);
  assert.match(contract, /INVENTORY_STAGNATION/);
});

test("deployment configuration check endpoint is documented", () => {
  const block = blockAfter("  /deployment/config:");

  assert.match(block, /summary: Inspect deployment configuration/);
  assert.match(block, /x-permission: account_set.view/);
  assert.match(block, /DeploymentConfig/);
  assert.match(contract, /llmDraft/);
  assert.match(contract, /AIS_LLM_DRAFT_PROVIDER/);
  assert.match(contract, /AIS_OCR_PROVIDER/);
  assert.match(contract, /AIS_OCR_COMMAND/);
  assert.match(contract, /commandPresent/);
  assert.match(contract, /idempotency/);
  assert.match(contract, /ttlHours/);
  assert.match(contract, /AIS_IDEMPOTENCY_TTL_HOURS/);
  assert.match(contract, /restoreDrill/);
  assert.match(contract, /RESTORE_DRILL/);
  assert.match(contract, /blockedChannels/);
});

test("Phase 6 Ops migration backup and restore job endpoints document dry-run contracts", () => {
  const migrationsBlock = blockAfter("  /ops/migrations/jobs:");
  const migrationDryRunBlock = blockAfter("  /ops/migrations/jobs/{migrationJobId}/dry-run:");
  const migrationImportBlock = blockAfter("  /ops/migrations/jobs/{migrationJobId}/import:");
  const backupsBlock = blockAfter("  /ops/backups:");
  const restoresBlock = blockAfter("  /ops/restores:");
  const executeRestoreBlock = blockAfter("  /ops/restores/execute:");

  assert.match(migrationsBlock, /CreateMigrationJobRequest/);
  assert.match(migrationsBlock, /MigrationJob/);
  assert.match(migrationsBlock, /x-permission: ops\.migration\.manage/);
  assert.match(migrationDryRunBlock, /summary: Dry-run a Phase 6 migration job without mutating business data/);
  assert.match(migrationDryRunBlock, /migrationJobId/);
  assert.match(migrationDryRunBlock, /MigrationJob/);
  assert.match(migrationDryRunBlock, /x-agent-allowed: false/);
  assert.match(migrationImportBlock, /summary: Import an approved Phase 6 migration job into formal business records/);
  assert.match(migrationImportBlock, /partner_master jobs into partner master data/);
  assert.match(migrationImportBlock, /inventory_item_master jobs into inventory item master data/);
  assert.match(migrationImportBlock, /x-risk-level: high/);
  assert.match(migrationImportBlock, /MIGRATION_DRY_RUN_REQUIRED|MIGRATION_IMPORT_UNSUPPORTED/);
  assert.match(migrationImportBlock, /fiscalYear/);
  assert.match(migrationImportBlock, /periodNo/);
  assert.match(backupsBlock, /summary: Create an auditable backup job/);
  assert.match(backupsBlock, /CreateBackupJobRequest/);
  assert.match(backupsBlock, /BackupJob/);
  assert.match(backupsBlock, /x-permission: ops\.backup\.manage/);
  assert.match(restoresBlock, /RestoreJob/);
  assert.match(restoresBlock, /x-permission: ops\.backup\.manage/);
  assert.match(executeRestoreBlock, /summary: Execute a restore dry-run inside the restore-drill sandbox/);
  assert.match(executeRestoreBlock, /CreateRestoreJobRequest/);
  assert.match(executeRestoreBlock, /RestoreJob/);
  assert.match(executeRestoreBlock, /x-agent-allowed: false/);
  assert.match(executeRestoreBlock, /RESTORE_DRILL_REQUIRED/);
  assert.match(contract, /BackupJob:/);
  assert.match(contract, /RestoreJob:/);
  assert.match(contract, /MigrationJob:/);
  assert.match(contract, /sourceSummary/);
  assert.match(contract, /fieldMapping/);
  assert.match(contract, /dry_run_completed/);
  assert.match(contract, /importSummary/);
  assert.match(contract, /restoreMode/);
  assert.match(contract, /silent_sandbox/);
  assert.match(contract, /businessMutation/);
  assert.match(contract, /attachmentHashVerification/);
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
  const agentToolsBlock = blockAfter("  /agent-tools:");
  const agentToolInvokeBlock = blockAfter("  /agent-tools/{toolName}/invoke:");
  const agentBlock = blockAfter("  /agent-actions:");
  const agentDetailBlock = blockAfter("  /agent-actions/{agentActionId}:");
  const agentSubmitBlock = blockAfter("  /agent-actions/{agentActionId}/submit:");
  const agentApproveBlock = blockAfter("  /agent-actions/{agentActionId}/approve:");
  const agentExecuteBlock = blockAfter("  /agent-actions/{agentActionId}/execute:");
  const agentReverseBlock = blockAfter("  /agent-actions/{agentActionId}/reverse:");
  const agentReplayBlock = blockAfter("  /agent-actions/{agentActionId}/replay:");

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
  assert.match(agentToolsBlock, /AgentTool/, "Agent tool registry endpoint must return registered tool metadata.");
  assert.match(agentToolsBlock, /x-permission: agent_action\.view/);
  assert.match(agentToolInvokeBlock, /InvokeAgentToolRequest/, "Agent tool invoke endpoint must document request payload.");
  assert.match(agentToolInvokeBlock, /AgentToolInvocationResult/, "Agent tool invoke endpoint must document dry-run result.");
  assert.match(agentToolInvokeBlock, /x-agent-allowed: true/);
  assert.match(contract, /suggest_purchase_order_draft/, "Agent tool registry must document draft generation tools.");
  assert.match(contract, /suggest_material_requisition_draft/, "Agent tool registry must document production material draft generation.");
  assert.match(contract, /suggest_product_receipt_draft/, "Agent tool registry must document finished goods receipt draft generation.");
  assert.match(contract, /approvalPolicy/, "Agent tool schema must expose approval policy.");
  assert.match(contract, /inputSchema/, "Agent tool schema must expose input schema.");
  assert.match(agentBlock, /CreateAgentActionRequest/, "Agent endpoint must reference its request schema.");
  assert.match(agentBlock, /AgentAction/, "Agent endpoint must reference its response schema.");
  assert.match(agentBlock, /get:/, "Agent action list endpoint must be documented.");
  assert.match(agentBlock, /AgentActionQueue/, "Agent action list endpoint must return a queue schema.");
  assert.match(agentBlock, /x-risk-level: low/, "Agent action list endpoint must be low-risk read-only.");
  assert.match(agentDetailBlock, /AgentAction/, "Agent detail endpoint must return the current action state.");
  assert.match(agentSubmitBlock, /AgentAction/, "Agent submit endpoint must return submitted action state.");
  assert.match(agentApproveBlock, /AgentAction/, "Agent approve endpoint must return approved action state.");
  assert.match(agentExecuteBlock, /AgentAction/, "Agent execute endpoint must return executed action state.");
  assert.match(agentExecuteBlock, /ExecuteAgentActionRequest/, "Agent execute endpoint must document explicit user token confirmation.");
  assert.match(agentReverseBlock, /AgentAction/, "Agent reverse endpoint must return reversed action state.");
  assert.match(agentReverseBlock, /ReverseAgentActionRequest/, "Agent reverse endpoint must document reversal reason.");
  assert.match(agentReverseBlock, /x-agent-allowed: false/, "Agent reverse endpoint must require a real user boundary.");
  assert.match(agentReplayBlock, /AgentActionReplay/, "Agent replay endpoint must return replay events.");
  assert.match(contract, /dry_run_completed/, "AgentAction schema must use the Phase 6 state machine.");
  assert.match(contract, /submitted_for_approval/, "AgentAction schema must expose approval submission state.");
  assert.match(contract, /approvalProgress/, "AgentAction schema must expose multi-approver progress.");
  assert.match(contract, /auditSummary/, "AgentAction schema must expose a human-readable audit summary.");
  assert.match(contract, /AgentActionAuditSummary/, "AgentAction audit summary schema must be documented.");
  assert.match(contract, /verificationStatus/, "AgentAction audit summary must expose evidence verification status.");
  assert.match(contract, /mutationState/, "AgentAction audit summary must expose mutation state.");
  assert.match(contract, /nextActions/, "AgentAction audit summary must expose next available actions.");
  assert.match(agentReplayBlock, /auditSummary/, "Agent replay endpoint must return the same audit summary as action detail.");
  assert.match(contract, /AgentActionQueueItem/, "AgentAction queue item schema must be documented.");
  assert.match(contract, /evidenceCount/, "AgentAction queue must expose evidence counts.");
  assert.match(contract, /remainingCount/, "Agent approval progress must expose remaining approvals.");
  assert.match(contract, /userTokenConfirmed/, "Agent execution request must expose explicit user token confirmation.");
  assert.match(contract, /executionResult/, "AgentAction schema must expose execution result.");
  assert.match(contract, /reversed/, "AgentAction schema must expose reversal state.");
  assert.match(contract, /reversalResult/, "AgentAction schema must expose reversal result.");
  assert.match(contract, /evidenceSnapshots/, "AgentAction schema must expose immutable evidence snapshots.");
  assert.match(contract, /AgentEvidenceSnapshot/, "AgentAction schema must reference evidence snapshot hashes.");
  assert.match(contract, /evidence_verified/, "Agent replay schema must expose successful evidence verification.");
  assert.match(contract, /evidence_verification_failed/, "Agent replay schema must expose failed evidence verification.");
  assert.match(contract, /restore_drill_outbound_blocked/, "Agent replay schema must expose restore-drill outbound blocking.");
  assert.match(contract, /name: Idempotency-Key/, "Idempotency-Key header must be defined.");
  assert.match(contract, /IDEMPOTENCY_SCOPE_MISMATCH/, "Idempotency-Key docs must mention account-set scope protection.");
  assert.match(contract, /default TTL is 7 days/, "Idempotency-Key docs must mention the default TTL.");
  assert.match(contract, /expired keys are purged/, "Idempotency-Key docs must mention expired-key behavior.");
  assert.match(contract, /dryRun/, "Agent-facing schemas must expose dryRun.");
  assert.match(contract, /evidenceRefs/, "Agent-facing schemas must expose evidenceRefs.");
  assert.match(contract, /approvalRequired/, "AI suggestions must expose approvalRequired.");
});

test("Phase 6 security events endpoint documents anomaly audit contract", () => {
  const securityEventsBlock = blockAfter("  /security/events:");

  assert.match(securityEventsBlock, /x-permission: security_event\.view/);
  assert.match(securityEventsBlock, /x-agent-allowed: false/);
  assert.match(securityEventsBlock, /SecurityEventList/);
  assert.match(securityEventsBlock, /accountSetId/);
  assert.match(securityEventsBlock, /eventType/);
  assert.match(securityEventsBlock, /severity/);
  assert.match(securityEventsBlock, /actorId/);
  assert.match(contract, /SecurityEvent:/);
  assert.match(contract, /permission_denied/);
  assert.match(contract, /idempotency_scope_mismatch/);
  assert.match(contract, /payload:/);
});

test("Phase 6 Agent draft candidate endpoints document local OCR and LLM draft adapter contracts", () => {
  const draftBlock = blockAfter("  /agent/draft-candidates:");
  const draftDetailBlock = blockAfter("  /agent/draft-candidates/{agentDraftCandidateId}:");
  const draftConvertBlock = blockAfter("  /agent/draft-candidates/{agentDraftCandidateId}/convert:");
  const draftRejectBlock = blockAfter("  /agent/draft-candidates/{agentDraftCandidateId}/reject:");
  const ocrPreviewBlock = blockAfter("  /ai/ocr-preview:");
  const llmBlock = blockAfter("  /ai/llm-draft-runs:");
  const llmMetricsBlock = blockAfter("  /ai/llm-draft-runs/metrics:");

  assert.match(draftBlock, /x-permission: ai\.generate_draft/);
  assert.match(draftBlock, /CreateAgentDraftCandidateRequest/);
  assert.match(draftBlock, /AgentDraftCandidate/);
  assert.match(draftBlock, /AgentDraftCandidateQueue/);
  assert.match(draftBlock, /accountSetId/);
  assert.match(draftBlock, /draftType/);
  assert.match(draftBlock, /status/);
  assert.match(draftDetailBlock, /x-permission: ai\.generate_draft/);
  assert.match(draftDetailBlock, /AgentDraftCandidate/);
  assert.match(draftConvertBlock, /x-permission: agent_draft\.convert/);
  assert.match(draftConvertBlock, /ConvertAgentDraftCandidateRequest/);
  assert.match(draftConvertBlock, /Voucher/);
  assert.match(draftConvertBlock, /PurchaseOrder/);
  assert.match(draftConvertBlock, /SalesOrder/);
  assert.match(draftConvertBlock, /InventoryMovementDraft/);
  assert.match(draftConvertBlock, /MaterialRequisition/);
  assert.match(draftConvertBlock, /ProductReceipt/);
  assert.match(draftConvertBlock, /StockCountPreview/);
  assert.match(draftConvertBlock, /AgentMasterDataDraft/);
  assert.match(draftConvertBlock, /AgentPayrollAllocationDraft/);
  assert.match(draftConvertBlock, /AgentAssetChangeDraft/);
  assert.match(draftConvertBlock, /AgentReportInterpretationDraft/);
  assert.match(draftRejectBlock, /x-permission: agent_draft\.convert/);
  assert.match(draftRejectBlock, /x-agent-allowed: false/);
  assert.match(draftRejectBlock, /RejectAgentDraftCandidateRequest/);
  assert.match(draftRejectBlock, /AgentDraftCandidate/);
  assert.match(ocrPreviewBlock, /x-permission: ai\.generate_draft/);
  assert.match(ocrPreviewBlock, /OcrPreview/);
  assert.match(llmBlock, /x-permission: ai\.generate_draft/);
  assert.match(llmBlock, /get:/);
  assert.match(llmBlock, /LlmDraftRunList/);
  assert.match(llmBlock, /status/);
  assert.match(llmBlock, /LlmDraftRun/);
  assert.match(llmMetricsBlock, /x-permission: ai\.generate_draft/);
  assert.match(llmMetricsBlock, /x-risk-level: low/);
  assert.match(llmMetricsBlock, /LlmDraftMetrics/);
  assert.match(llmMetricsBlock, /draftType/);
  assert.match(contract, /attachmentIds:/);
  assert.match(contract, /reviewedOcrResults:/);
  assert.match(contract, /resolvedUnmatchedItems:/);
  assert.match(contract, /AgentDraftResolvedUnmatchedItem/);
  assert.match(contract, /originalExtractedText:/);
  assert.match(contract, /reviewedBy:/);
  assert.match(contract, /rejectedBy:/);
  assert.match(contract, /rejectionReason:/);
  assert.match(contract, /ocrResults:/);
  assert.match(contract, /AgentDraftSourceContext:/);
  assert.match(contract, /AgentDraftSourceObject:/);
  assert.match(contract, /sourceObject:/);
  assert.match(contract, /work_order/);
  assert.match(contract, /workOrderNo:/);
  assert.match(contract, /bomLines:/);
  const sourceObjectStart = contract.indexOf("    AgentDraftSourceObject:");
  const sourceObjectEnd = contract.indexOf("    AgentDraftCandidate:", sourceObjectStart);
  const sourceObjectBlock = contract.slice(sourceObjectStart, sourceObjectEnd);
  assert.match(sourceObjectBlock, /enum: \[work_order, purchase_order, sales_order, inventory_movement, stock_count, voucher, payroll_run, fixed_asset, report_run\]/);
  assert.match(sourceObjectBlock, /orderNo:/);
  assert.match(sourceObjectBlock, /supplierId:/);
  assert.match(sourceObjectBlock, /customerId:/);
  assert.match(sourceObjectBlock, /documentNo:/);
  assert.match(sourceObjectBlock, /movementType:/);
  assert.match(sourceObjectBlock, /countNo:/);
  assert.match(sourceObjectBlock, /voucherNo:/);
  assert.match(sourceObjectBlock, /voucherDate:/);
  assert.match(sourceObjectBlock, /runNo:/);
  assert.match(sourceObjectBlock, /totalCompanyCost:/);
  assert.match(sourceObjectBlock, /assetNo:/);
  assert.match(sourceObjectBlock, /assetName:/);
  assert.match(sourceObjectBlock, /netValue:/);
  assert.match(sourceObjectBlock, /currentDepartmentId:/);
  assert.match(sourceObjectBlock, /templateVersionId:/);
  assert.match(sourceObjectBlock, /snapshotHash:/);
  assert.match(sourceObjectBlock, /cellCount:/);
  assert.match(sourceObjectBlock, /evidenceRef:/);
  assert.match(sourceObjectBlock, /traceLinks:/);
  assert.match(sourceObjectBlock, /actualQuantity:/);
  assert.match(sourceObjectBlock, /totalAdjustmentAmount:/);
  assert.match(sourceObjectBlock, /lines:/);
  assert.match(sourceObjectBlock, /itemCode:/);
  assert.match(sourceObjectBlock, /accountName:/);
  assert.match(sourceObjectBlock, /debit:/);
  assert.match(sourceObjectBlock, /credit:/);
  assert.match(contract, /local-ocr-placeholder/);
  assert.match(contract, /local-command-ocr/);
  assert.match(contract, /local-tesseract/);
  assert.match(contract, /completed_empty/);
  assert.match(contract, /configured-local-ocr/);
  assert.match(contract, /openai-compatible/);
  assert.match(contract, /llmDraftRun:/);
  assert.match(contract, /LlmDraftRunListItem:/);
  assert.match(contract, /schemaSuccessRate:/);
  assert.match(contract, /adoptionRate:/);
  assert.match(contract, /humanCorrectionRate:/);
  assert.match(contract, /providerBreakdown:/);
  assert.match(contract, /errorMessage:/);
  assert.match(contract, /requiresHumanConfirmation:/);
  assert.match(contract, /unmatchedItems:/);
  assert.match(contract, /purchase_order/);
  assert.match(contract, /inventory_movement/);
  assert.match(contract, /material_requisition/);
  assert.match(contract, /product_receipt/);
  assert.match(contract, /depreciation_run/);
  assert.match(contract, /dryRun:/);

  const convertBlock = blockAfter("  /agent/draft-candidates/{agentDraftCandidateId}/convert:");
  assert.match(convertBlock, /AgentDepreciationRunDraft/);
  assert.match(convertBlock, /non-mutating depreciation dry-run drafts/);
  const convertRequestBlock = schemaBlock("    ConvertAgentDraftCandidateRequest:", "    RejectAgentDraftCandidateRequest:");
  assert.match(convertRequestBlock, /runNo:/);
  assert.match(convertRequestBlock, /documentType is depreciation_run/);
  assert.match(convertRequestBlock, /required: \[documentType\]/);
  const depreciationDraftBlock = schemaBlock("    AgentDepreciationRunDraft:", "    AgentAssetChangeDraft:");
  assert.match(depreciationDraftBlock, /documentType:/);
  assert.match(depreciationDraftBlock, /enum: \[depreciation_run\]/);
  assert.match(depreciationDraftBlock, /const: true/);
  assert.match(depreciationDraftBlock, /DepreciationRunLine/);
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
