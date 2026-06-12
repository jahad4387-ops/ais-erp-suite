import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/api.mjs";

async function request(api, method, path, body, idempotencyKey = "business-finance-test") {
  return api.handle({
    method,
    path,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body
  });
}

test("Phase 6 business finance workbench links supply-chain facts to finance review and close blocking", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6BFI",
      name: "Phase 6 Business Finance",
      companyName: "Phase 6 Business Finance Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "phase6-business-finance-account"
  );
  const accountSetId = accountSet.body.id;
  const currentPeriod = {
    id: "period:bfi:2026:6",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 6,
    status: "open",
    isCurrent: true,
    openedBy: "system",
    openedAt: "now",
    closedBy: null,
    closedAt: null,
    lockedBy: null,
    lockedAt: null
  };
  api.state.periods.set(currentPeriod.id, currentPeriod);

  api.state.workOrders.set("work-order:bfi-1", {
    id: "work-order:bfi-1",
    accountSetId,
    workOrderNo: "WO-BFI-1",
    productItemId: "item:fg-bfi",
    productItemCode: "FG-BFI",
    productItemName: "Business Finance Finished Good",
    bomId: "bom:bfi",
    bomVersion: "A",
    plannedQuantity: 10,
    completedQuantity: 0,
    directMaterialCost: 0,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6,
    createdBy: "planner",
    createdAt: "now"
  });
  api.state.costAllocations.set("cost-allocation:bfi-1", {
    id: "cost-allocation:bfi-1",
    accountSetId,
    workOrderId: "work-order:bfi-1",
    workOrderNo: "WO-BFI-1",
    fiscalYear: 2026,
    periodNo: 6,
    dryRun: false,
    status: "committed",
    totalAllocatedAmount: 500,
    warningCodes: [],
    lines: [],
    adjustments: [],
    createdBy: "cost-accountant",
    createdAt: "now"
  });
  api.state.costVoucherDrafts.set("cost-voucher-draft:bfi-1", {
    id: "cost-voucher-draft:bfi-1",
    accountSetId,
    costAllocationId: "cost-allocation:bfi-1",
    workOrderId: "work-order:bfi-1",
    workOrderNo: "WO-BFI-1",
    fiscalYear: 2026,
    periodNo: 6,
    status: "draft",
    totalAmount: 500,
    directMaterialCost: 0,
    allocatedCost: 500,
    warningCodes: [],
    approvalRequired: true,
    voucherDraft: {
      sourceType: "phase3_cost_allocation",
      sourceDocumentId: "cost-allocation:bfi-1",
      sourceDocumentNo: "WO-BFI-1",
      fiscalYear: 2026,
      periodNo: 6,
      totalAmount: 500,
      approvalRequired: true,
      lines: []
    },
    createdBy: "cost-accountant",
    createdAt: "now"
  });
  api.state.inventoryReconciliationRuns.set("inventory-reconciliation:bfi-1", {
    id: "inventory-reconciliation:bfi-1",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 6,
    inventoryBalanceTotal: 1000,
    costAdjustmentTotal: 988,
    differenceAmount: 12,
    rows: [],
    createdAt: "now"
  });

  const workbench = await request(
    api,
    "GET",
    `/business-finance/workbench?accountSetId=${encodeURIComponent(accountSetId)}&fiscalYear=2026&periodNo=6`
  );
  const closeCheck = await request(
    api,
    "POST",
    "/agent-tools/run_supply_chain_close_check/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true },
    "phase6-business-finance-close-check"
  );
  const close = await request(
    api,
    "POST",
    `/periods/${currentPeriod.id}/close`,
    { closedBy: "finance-manager" },
    "phase6-business-finance-period-close"
  );

  assert.equal(workbench.status, 200);
  assert.equal(workbench.body.summary.pendingVoucherDrafts, 1);
  assert.equal(workbench.body.summary.voucherDraftsRequiringApproval, 1);
  assert.equal(workbench.body.summary.inventoryReconciliationExceptions, 1);
  assert.equal(workbench.body.summary.supplyChainCloseBlocks, 4);
  assert.equal(workbench.body.queues.voucherDrafts[0].sourceTrace.sourceType, "work_order");
  assert.equal(workbench.body.queues.voucherDrafts[0].sourceTrace.sourceDocumentNo, "WO-BFI-1");
  assert.ok(workbench.body.queues.closeBlocks[0].evidenceRefs.includes("work-order:bfi-1"));
  assert.equal(closeCheck.status, 201);
  assert.ok(closeCheck.body.result.dryRunResult.blockingErrors.some((message) => message.includes("WO-BFI-1")));
  assert.equal(close.status, 409);
  assert.equal(close.body.code, "SUPPLY_CHAIN_CLOSE_BLOCKED");
  assert.equal(close.body.closeBlocks[0].sourceDocumentNo, "WO-BFI-1");
});
