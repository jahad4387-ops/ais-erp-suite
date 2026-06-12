import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/api.mjs";

async function request(api, method, path, body, idempotencyKey = "advanced-manufacturing-test") {
  return api.handle({
    method,
    path,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body
  });
}

test("Phase 5 advanced manufacturing APIs create plans, rework, outsourcing, traceability, and line-side flows", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5MFG",
      name: "Phase 5 Advanced Manufacturing",
      companyName: "Phase 5 Manufacturing Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "phase5-mfg-account"
  );
  const accountSetId = accountSet.body.id;

  const plan = await request(
    api,
    "POST",
    "/production-plans",
    {
      accountSetId,
      planNo: "MPS-202606-001",
      fiscalYear: 2026,
      periodNo: 6,
      status: "draft",
      createdBy: "planner",
      lines: [
        {
          productItemId: "item:fg-100",
          productItemCode: "FG-100",
          productItemName: "Finished Product 100",
          plannedQuantity: 20,
          plannedStartDate: "2026-06-13",
          plannedFinishDate: "2026-06-20"
        }
      ]
    },
    "phase5-production-plan"
  );
  const planWorkOrders = await request(
    api,
    "POST",
    `/production-plans/${encodeURIComponent(plan.body.id)}/generate-work-orders`,
    { dryRun: true, requestedBy: "planner" },
    "phase5-plan-work-orders"
  );
  const rework = await request(
    api,
    "POST",
    "/rework-orders",
    {
      accountSetId,
      reworkNo: "RW-202606-001",
      sourceWorkOrderId: "work-order:source-1",
      sourceOrderNo: "SO-REWORK-1",
      itemCode: "FG-100",
      itemName: "Finished Product 100",
      quantity: 2,
      reasonCode: "quality_exception",
      status: "draft",
      createdBy: "qc"
    },
    "phase5-rework"
  );
  const reworkApproval = await request(
    api,
    "POST",
    `/rework-orders/${encodeURIComponent(rework.body.id)}/approve`,
    { approvedBy: "manager" },
    "phase5-rework-approve"
  );
  const outsourcing = await request(
    api,
    "POST",
    "/outsourcing-orders",
    {
      accountSetId,
      outsourcingNo: "OS-202606-001",
      supplierId: "supplier:os-1",
      supplierName: "Outside Processor",
      sourceWorkOrderId: "work-order:source-1",
      itemCode: "FG-100",
      itemName: "Finished Product 100",
      quantity: 5,
      processName: "Coating",
      status: "draft",
      createdBy: "planner"
    },
    "phase5-outsourcing"
  );
  const traceRule = await request(
    api,
    "POST",
    "/trace-rules",
    {
      accountSetId,
      code: "BATCH-FG",
      name: "Finished goods batch trace",
      objectType: "finished_good",
      direction: "both",
      isEnabled: true,
      createdBy: "quality"
    },
    "phase5-trace-rule"
  );
  const traceQuery = await request(
    api,
    "POST",
    "/traceability/query",
    {
      accountSetId,
      ruleId: traceRule.body.id,
      batchNo: "BATCH-202606-A",
      direction: "backward",
      requestedBy: "quality"
    },
    "phase5-trace-query"
  );
  const lineSide = await request(
    api,
    "POST",
    "/line-side-warehouses",
    {
      accountSetId,
      code: "LS-01",
      name: "Line 1 Side Warehouse",
      productionLineCode: "LINE-1",
      mainWarehouseCode: "MAIN",
      isEnabled: true,
      createdBy: "warehouse"
    },
    "phase5-line-side"
  );
  const lineSideMove = await request(
    api,
    "POST",
    "/line-side-material-movements",
    {
      accountSetId,
      lineSideWarehouseId: lineSide.body.id,
      movementType: "replenish",
      workOrderId: "work-order:source-1",
      itemCode: "MAT-100",
      itemName: "Material 100",
      quantity: 12,
      createdBy: "warehouse"
    },
    "phase5-line-side-move"
  );
  const planList = await request(api, "GET", `/production-plans?accountSetId=${encodeURIComponent(accountSetId)}`);
  const reworkList = await request(api, "GET", `/rework-orders?accountSetId=${encodeURIComponent(accountSetId)}`);
  const outsourcingList = await request(api, "GET", `/outsourcing-orders?accountSetId=${encodeURIComponent(accountSetId)}`);
  const traceRules = await request(api, "GET", `/trace-rules?accountSetId=${encodeURIComponent(accountSetId)}`);
  const lineSideList = await request(api, "GET", `/line-side-warehouses?accountSetId=${encodeURIComponent(accountSetId)}`);

  assert.equal(plan.status, 201);
  assert.equal(plan.body.lines[0].lineNo, 1);
  assert.equal(planWorkOrders.status, 200);
  assert.equal(planWorkOrders.body.dryRun, true);
  assert.equal(planWorkOrders.body.workOrderDrafts[0].planLineId, plan.body.lines[0].id);
  assert.equal(rework.status, 201);
  assert.equal(reworkApproval.body.status, "approved");
  assert.equal(outsourcing.status, 201);
  assert.equal(outsourcing.body.processName, "Coating");
  assert.equal(traceRule.status, 201);
  assert.equal(traceQuery.status, 201);
  assert.equal(traceQuery.body.nodes[0].batchNo, "BATCH-202606-A");
  assert.equal(lineSide.status, 201);
  assert.equal(lineSideMove.status, 201);
  assert.equal(lineSideMove.body.movementType, "replenish");
  assert.equal(planList.body.total, 1);
  assert.equal(reworkList.body.total, 1);
  assert.equal(outsourcingList.body.total, 1);
  assert.equal(traceRules.body.total, 1);
  assert.equal(lineSideList.body.total, 1);
});
