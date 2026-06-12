import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/api.mjs";

async function request(api, method, path, body, idempotencyKey = "supply-chain-dashboard-test") {
  return api.handle({
    method,
    path,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body
  });
}

test("supply chain dashboard summarizes orders, inventory exceptions, production progress, and Agent approvals", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCDASH",
      name: "Supply Chain Dashboard",
      companyName: "Supply Chain Dashboard Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "supply-chain-dashboard-account"
  );
  const accountSetId = accountSet.body.id;

  api.state.purchaseOrders.set("purchase-order:late", {
    id: "purchase-order:late",
    accountSetId,
    orderNo: "PO-LATE",
    status: "approved",
    orderDate: "2026-06-03",
    expectedDeliveryDate: "2026-06-08",
    totalAmount: 1200
  });
  api.state.salesOrders.set("sales-order:ready", {
    id: "sales-order:ready",
    accountSetId,
    orderNo: "SO-READY",
    status: "approved",
    orderDate: "2026-06-04",
    totalAmount: 2600
  });
  api.state.inventoryBalances.set("balance:negative", {
    id: "balance:negative",
    accountSetId,
    itemCode: "MAT-NEG",
    itemName: "Negative Material",
    warehouseCode: "MAIN",
    quantity: -3,
    lockedQuantity: 0,
    amount: -90,
    updatedAt: "2026-06-10"
  });
  api.state.workOrders.set("work-order:released", {
    id: "work-order:released",
    accountSetId,
    workOrderNo: "WO-REL",
    status: "released",
    plannedStartDate: "2026-06-10",
    plannedFinishDate: "2026-06-14"
  });
  api.state.workOrders.set("work-order:progress", {
    id: "work-order:progress",
    accountSetId,
    workOrderNo: "WO-WIP",
    status: "in_progress",
    plannedStartDate: "2026-06-11",
    plannedFinishDate: "2026-06-15"
  });
  api.state.materialRequisitions.set("material-requisition:submitted", {
    id: "material-requisition:submitted",
    accountSetId,
    requisitionNo: "MR-SUB",
    status: "submitted",
    workOrderId: "work-order:released"
  });
  api.state.productReceipts.set("product-receipt:pending-cost", {
    id: "product-receipt:pending-cost",
    accountSetId,
    receiptNo: "PR-PENDING",
    status: "posted",
    costStatus: "pending"
  });
  api.state.agentActions.set("agent-action:approval", {
    id: "agent-action:approval",
    accountSetId,
    toolName: "suggest_material_requisition_draft",
    status: "submitted_for_approval",
    riskLevel: "medium"
  });

  const response = await request(
    api,
    "GET",
    `/supply-chain/dashboard?accountSetId=${encodeURIComponent(accountSetId)}&fiscalYear=2026&periodNo=6&asOfDate=2026-06-13`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.accountSetId, accountSetId);
  assert.equal(response.body.fiscalYear, 2026);
  assert.equal(response.body.periodNo, 6);
  assert.equal(response.body.summary.pendingOrders.count, 2);
  assert.equal(response.body.summary.purchaseOverdue.count, 1);
  assert.equal(response.body.summary.inventoryExceptions.count, 1);
  assert.equal(response.body.summary.materialShortages.count, 1);
  assert.equal(response.body.summary.workOrdersToIssue.count, 1);
  assert.equal(response.body.summary.workOrdersToReceive.count, 1);
  assert.equal(response.body.summary.costPending.count, 1);
  assert.equal(response.body.summary.pendingAgentApprovals.count, 1);
  assert.equal(response.body.workOrderProgress.released, 1);
  assert.equal(response.body.workOrderProgress.inProgress, 1);
  assert.equal(response.body.queues.inventoryExceptions[0].itemCode, "MAT-NEG");
  assert.equal(response.body.agentSuggestions[0].code, "MATERIAL_SHORTAGE_REVIEW");
});
