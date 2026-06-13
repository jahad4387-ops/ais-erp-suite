import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/api.mjs";

async function request(api, method, path, body, idempotencyKey = "agent-supply-chain-tools-test") {
  return api.handle({
    method,
    path,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body
  });
}

const supplyChainToolNames = [
  "analyze_supply_chain_dashboard",
  "detect_material_shortage",
  "generate_purchase_suggestions",
  "generate_production_plan",
  "generate_work_orders_from_plan",
  "generate_material_requisition",
  "generate_product_receipt",
  "generate_sales_delivery",
  "analyze_inventory_availability",
  "detect_inventory_anomalies",
  "generate_stock_count_plan",
  "generate_outsourcing_order",
  "generate_rework_plan",
  "trace_material_batch",
  "calculate_work_order_cost",
  "generate_cost_voucher_draft",
  "run_supply_chain_close_check"
];

test("Phase 3 supply chain Agent tools are registered with unified dry-run contracts", async () => {
  const api = createApi();

  const response = await request(api, "GET", "/agent-tools");

  assert.equal(response.status, 200);
  const toolsByName = new Map(response.body.tools.map((tool) => [tool.name, tool]));
  for (const toolName of supplyChainToolNames) {
    const tool = toolsByName.get(toolName);
    assert.ok(tool, `${toolName} should be registered.`);
    assert.equal(tool.actionKind, "dry_run");
    assert.equal(tool.agentTokenAllowed, true);
    assert.deepEqual(tool.inputSchema.required, ["accountSetId", "fiscalYear", "periodNo"]);
    assert.ok(tool.outputSchema.required.includes("summary"));
    assert.ok(tool.outputSchema.required.includes("draftPayload"));
    assert.ok(tool.outputSchema.required.includes("warnings"));
    assert.ok(tool.outputSchema.required.includes("blockingErrors"));
    assert.ok(tool.outputSchema.required.includes("nextActions"));
  }

  assert.equal(toolsByName.get("analyze_supply_chain_dashboard").riskLevel, "low");
  assert.equal(toolsByName.get("generate_purchase_suggestions").riskLevel, "medium");
  assert.equal(toolsByName.get("generate_cost_voucher_draft").riskLevel, "high");
  assert.equal(toolsByName.get("run_supply_chain_close_check").approvalPolicy.minApprovals, 2);
});

test("Phase 5 manufacturing pages can open Agent draft candidates with source context", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCCTX",
      name: "Supply Chain Context Agents",
      companyName: "Supply Chain Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-supply-chain-context-account"
  );

  const contexts = [
    ["production_plan", "production_plan_page"],
    ["rework_order", "rework_order_page"],
    ["outsourcing_order", "outsourcing_order_page"],
    ["traceability_report", "traceability_page"],
    ["line_side_replenishment", "line_side_warehouse_page"]
  ];

  for (const [draftType, sourceObjectType] of contexts) {
    const candidate = await request(
      api,
      "POST",
      "/agent/draft-candidates",
      {
        accountSetId: accountSet.body.id,
        fiscalPeriodId: "period:scctx:2026:6",
        draftType,
        sourceObjectType,
        userInstruction: `Generate ${draftType} draft from ${sourceObjectType}.`,
        evidenceRefs: [`${sourceObjectType}:sample`],
        dryRun: true
      },
      `agent-supply-chain-context-${draftType}`
    );

    assert.equal(candidate.status, 201, `${draftType} should create a reviewable candidate.`);
    assert.equal(candidate.body.draftType, draftType);
    assert.equal(candidate.body.sourceObjectType, sourceObjectType);
    assert.equal(candidate.body.status, "candidate");
    assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
    assert.equal(candidate.body.requiresHumanConfirmation, true);
  }
});

test("Phase 3 supply chain Agent tool invocation records a dry-run action with business-safe output", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCAGT",
      name: "Supply Chain Agent Tools",
      companyName: "Supply Chain Agent Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-supply-chain-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.inventoryBalances.set("balance:shortage", {
    id: "balance:shortage",
    accountSetId,
    itemCode: "MAT-SHORT",
    itemName: "Short Material",
    warehouseCode: "MAIN",
    quantity: -8,
    lockedQuantity: 0,
    amount: -160,
    updatedAt: "2026-06-12"
  });

  const response = await request(
    api,
    "POST",
    "/agent-tools/detect_material_shortage/invoke",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      dryRun: true,
      evidenceRefs: ["inventory-balance:MAT-SHORT"],
      payload: { source: "dashboard" },
      requestedBy: "planner"
    },
    "agent-supply-chain-shortage-invoke"
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.toolName, "detect_material_shortage");
  assert.equal(response.body.resultType, "agent_action");
  assert.equal(response.body.result.status, "dry_run_completed");
  assert.equal(response.body.result.riskLevel, "low");
  assert.equal(response.body.result.dryRunResult.businessMutation, false);
  assert.equal(response.body.result.dryRunResult.toolName, "detect_material_shortage");
  assert.match(response.body.result.dryRunResult.summary, /缺料|shortage/i);
  assert.deepEqual(response.body.result.dryRunResult.evidenceRefs, ["inventory-balance:MAT-SHORT"]);
  assert.equal(response.body.result.dryRunResult.draftPayload.materialShortages[0].itemCode, "MAT-SHORT");
  assert.ok(Array.isArray(response.body.result.dryRunResult.warnings));
  assert.ok(Array.isArray(response.body.result.dryRunResult.blockingErrors));
  assert.ok(response.body.result.dryRunResult.nextActions.includes("generate_purchase_suggestions"));
  assert.equal(api.state.agentActions.get(response.body.result.id).toolName, "detect_material_shortage");
});

test("Phase 4 material shortage Agent expands work-order BOM demand against available inventory", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCMSA",
      name: "Supply Chain Material Shortage Agent",
      companyName: "Supply Chain Material Shortage Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-material-shortage-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.boms.set("bom:fg-a", {
    id: "bom:fg-a",
    accountSetId,
    productItemId: "item:fg-a",
    productItemCode: "FG-A",
    productItemName: "Finished A",
    version: "V1",
    yieldQuantity: 1,
    status: "approved",
    lines: [
      {
        id: "bom-line:mat-a",
        bomId: "bom:fg-a",
        componentItemId: "item:mat-a",
        componentItemCode: "MAT-A",
        componentItemName: "Material A",
        lineNo: 1,
        quantity: 2,
        scrapRate: 0
      }
    ]
  });
  api.state.workOrders.set("work-order:wo-a", {
    id: "work-order:wo-a",
    accountSetId,
    workOrderNo: "WO-A",
    productItemId: "item:fg-a",
    productItemCode: "FG-A",
    productItemName: "Finished A",
    bomId: "bom:fg-a",
    plannedQuantity: 5,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6
  });
  api.state.inventoryBalances.set("balance:mat-a", {
    id: "balance:mat-a",
    accountSetId,
    itemId: "item:mat-a",
    itemCode: "MAT-A",
    itemName: "Material A",
    warehouseCode: "MAIN",
    quantity: 3,
    lockedQuantity: 1,
    amount: 30
  });

  const response = await request(
    api,
    "POST",
    "/agent-tools/detect_material_shortage/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, evidenceRefs: [] },
    "agent-material-shortage-expand"
  );

  const shortage = response.body.result.dryRunResult.draftPayload.materialShortages[0];
  assert.equal(response.status, 201);
  assert.equal(shortage.itemCode, "MAT-A");
  assert.equal(shortage.requiredQuantity, 10);
  assert.equal(shortage.availableQuantity, 2);
  assert.equal(shortage.shortageQuantity, 8);
  assert.equal(shortage.demandSources[0].workOrderNo, "WO-A");
  assert.equal(response.body.result.dryRunResult.blockingErrors.length, 0);
  assert.ok(response.body.result.dryRunResult.nextActions.includes("generate_purchase_suggestions"));
});

test("Phase 4 purchase suggestion Agent converts shortage analysis into reviewable purchase advice", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCPUR",
      name: "Supply Chain Purchase Suggestion Agent",
      companyName: "Supply Chain Purchase Suggestion Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-purchase-suggestion-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.boms.set("bom:fg-b", {
    id: "bom:fg-b",
    accountSetId,
    productItemId: "item:fg-b",
    productItemCode: "FG-B",
    productItemName: "Finished B",
    version: "V1",
    yieldQuantity: 1,
    status: "approved",
    lines: [
      {
        id: "bom-line:mat-b",
        bomId: "bom:fg-b",
        componentItemId: "item:mat-b",
        componentItemCode: "MAT-B",
        componentItemName: "Material B",
        lineNo: 1,
        quantity: 3,
        scrapRate: 0
      }
    ]
  });
  api.state.workOrders.set("work-order:wo-b", {
    id: "work-order:wo-b",
    accountSetId,
    workOrderNo: "WO-B",
    productItemId: "item:fg-b",
    productItemCode: "FG-B",
    productItemName: "Finished B",
    bomId: "bom:fg-b",
    plannedQuantity: 4,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6
  });
  api.state.inventoryBalances.set("balance:mat-b", {
    id: "balance:mat-b",
    accountSetId,
    itemId: "item:mat-b",
    itemCode: "MAT-B",
    itemName: "Material B",
    warehouseCode: "MAIN",
    quantity: 2,
    lockedQuantity: 0,
    amount: 20
  });

  const response = await request(
    api,
    "POST",
    "/agent-tools/generate_purchase_suggestions/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, evidenceRefs: ["work-order:wo-b"] },
    "agent-purchase-suggestion-generate"
  );

  const suggestion = response.body.result.dryRunResult.draftPayload.purchaseSuggestions[0];
  assert.equal(response.status, 201);
  assert.equal(response.body.result.riskLevel, "medium");
  assert.equal(response.body.result.approvalRequired, true);
  assert.equal(suggestion.documentType, "purchase_suggestion");
  assert.equal(suggestion.itemCode, "MAT-B");
  assert.equal(suggestion.suggestedQuantity, 10);
  assert.equal(suggestion.reasonCode, "material_shortage");
  assert.ok(response.body.result.dryRunResult.nextActions.includes("suggest_purchase_order_draft"));
});

test("Phase 4 inventory anomaly Agent classifies stock risks and proposes a count plan", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCINV",
      name: "Supply Chain Inventory Anomaly Agent",
      companyName: "Supply Chain Inventory Anomaly Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-inventory-anomaly-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.inventoryBalances.set("balance:locked-over", {
    id: "balance:locked-over",
    accountSetId,
    itemCode: "MAT-LOCK",
    itemName: "Locked Material",
    warehouseCode: "MAIN",
    quantity: 4,
    lockedQuantity: 6,
    amount: 40
  });
  api.state.inventoryBalances.set("balance:zero-value", {
    id: "balance:zero-value",
    accountSetId,
    itemCode: "MAT-ZERO",
    itemName: "Zero Quantity Value",
    warehouseCode: "MAIN",
    quantity: 0,
    lockedQuantity: 0,
    amount: 25
  });

  const response = await request(
    api,
    "POST",
    "/agent-tools/detect_inventory_anomalies/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, evidenceRefs: [] },
    "agent-inventory-anomaly-detect"
  );

  const anomalyTypes = response.body.result.dryRunResult.draftPayload.inventoryAnomalies.map((row) => row.anomalyType);
  assert.equal(response.status, 201);
  assert.ok(anomalyTypes.includes("locked_over_available"));
  assert.ok(anomalyTypes.includes("zero_quantity_amount_residual"));
  assert.equal(response.body.result.dryRunResult.draftPayload.stockCountPlan.documentType, "stock_count_plan");
  assert.ok(response.body.result.dryRunResult.nextActions.includes("generate_stock_count_plan"));
});

test("Phase 4 material requisition Agent proposes work-order issue drafts and blocks shortages", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCREQ",
      name: "Supply Chain Requisition Agent",
      companyName: "Supply Chain Requisition Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-requisition-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.boms.set("bom:fg-req", {
    id: "bom:fg-req",
    accountSetId,
    productItemId: "item:fg-req",
    productItemCode: "FG-REQ",
    productItemName: "Finished Requisition",
    version: "V1",
    yieldQuantity: 1,
    status: "approved",
    lines: [
      {
        id: "bom-line:mat-req",
        bomId: "bom:fg-req",
        componentItemId: "item:mat-req",
        componentItemCode: "MAT-REQ",
        componentItemName: "Material Requisition",
        lineNo: 1,
        quantity: 2,
        scrapRate: 0
      }
    ]
  });
  api.state.workOrders.set("work-order:wo-req", {
    id: "work-order:wo-req",
    accountSetId,
    workOrderNo: "WO-REQ",
    productItemId: "item:fg-req",
    productItemCode: "FG-REQ",
    productItemName: "Finished Requisition",
    bomId: "bom:fg-req",
    plannedQuantity: 5,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6
  });
  api.state.inventoryBalances.set("balance:mat-req", {
    id: "balance:mat-req",
    accountSetId,
    itemId: "item:mat-req",
    itemCode: "MAT-REQ",
    itemName: "Material Requisition",
    warehouseCode: "MAIN",
    quantity: 20,
    lockedQuantity: 0,
    amount: 100,
    unitCost: 5
  });

  const enough = await request(
    api,
    "POST",
    "/agent-tools/generate_material_requisition/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "work-order:wo-req", evidenceRefs: [] },
    "agent-requisition-enough"
  );
  api.state.inventoryBalances.set("balance:mat-req", {
    ...api.state.inventoryBalances.get("balance:mat-req"),
    quantity: 4,
    amount: 20
  });
  const shortage = await request(
    api,
    "POST",
    "/agent-tools/generate_material_requisition/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "work-order:wo-req", evidenceRefs: [] },
    "agent-requisition-shortage"
  );

  assert.equal(enough.status, 201);
  assert.equal(enough.body.result.dryRunResult.draftPayload.materialRequisitionDraft.documentType, "material_requisition_draft");
  assert.equal(enough.body.result.dryRunResult.draftPayload.materialRequisitionDraft.workOrderNo, "WO-REQ");
  assert.equal(enough.body.result.dryRunResult.draftPayload.materialRequisitionDraft.lines[0].quantity, 10);
  assert.deepEqual(enough.body.result.dryRunResult.blockingErrors, []);
  assert.equal(shortage.status, 201);
  assert.match(shortage.body.result.dryRunResult.blockingErrors.join(" / "), /库存不足|缺料/);
});

test("Phase 4 product receipt and cost Agents propose completion and costing dry-runs", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCCOST",
      name: "Supply Chain Cost Agent",
      companyName: "Supply Chain Cost Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-cost-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.boms.set("bom:fg-cost", {
    id: "bom:fg-cost",
    accountSetId,
    productItemId: "item:fg-cost",
    productItemCode: "FG-COST",
    productItemName: "Finished Cost",
    version: "V1",
    yieldQuantity: 1,
    status: "approved",
    lines: [
      {
        id: "bom-line:mat-cost",
        bomId: "bom:fg-cost",
        componentItemId: "item:mat-cost",
        componentItemCode: "MAT-COST",
        componentItemName: "Material Cost",
        lineNo: 1,
        quantity: 2,
        scrapRate: 0
      }
    ]
  });
  api.state.workOrders.set("work-order:wo-cost-agent", {
    id: "work-order:wo-cost-agent",
    accountSetId,
    workOrderNo: "WO-COST-AGENT",
    productItemId: "item:fg-cost",
    productItemCode: "FG-COST",
    productItemName: "Finished Cost",
    bomId: "bom:fg-cost",
    plannedQuantity: 4,
    completedQuantity: 1,
    status: "in_progress",
    fiscalYear: 2026,
    periodNo: 6
  });
  api.state.inventoryBalances.set("balance:mat-cost", {
    id: "balance:mat-cost",
    accountSetId,
    itemId: "item:mat-cost",
    itemCode: "MAT-COST",
    itemName: "Material Cost",
    warehouseCode: "MAIN",
    quantity: 100,
    lockedQuantity: 0,
    amount: 500,
    unitCost: 5
  });

  const receipt = await request(
    api,
    "POST",
    "/agent-tools/generate_product_receipt/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "work-order:wo-cost-agent", evidenceRefs: [] },
    "agent-product-receipt"
  );
  const cost = await request(
    api,
    "POST",
    "/agent-tools/calculate_work_order_cost/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "work-order:wo-cost-agent", evidenceRefs: [] },
    "agent-work-order-cost"
  );
  const voucher = await request(
    api,
    "POST",
    "/agent-tools/generate_cost_voucher_draft/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "work-order:wo-cost-agent", evidenceRefs: [] },
    "agent-cost-voucher"
  );

  assert.equal(receipt.status, 201);
  assert.equal(receipt.body.result.dryRunResult.draftPayload.productReceiptDraft.documentType, "product_receipt_draft");
  assert.equal(receipt.body.result.dryRunResult.draftPayload.productReceiptDraft.quantity, 3);
  assert.equal(cost.status, 201);
  assert.equal(cost.body.result.dryRunResult.draftPayload.workOrderCostEstimate.totalMaterialCost, 40);
  assert.equal(cost.body.result.dryRunResult.draftPayload.workOrderCostEstimate.estimatedUnitCost, 10);
  assert.equal(voucher.status, 201);
  assert.equal(voucher.body.result.riskLevel, "high");
  assert.equal(voucher.body.result.dryRunResult.draftPayload.costVoucherDraftRecommendation.documentType, "cost_voucher_draft_recommendation");
  assert.equal(voucher.body.result.dryRunResult.draftPayload.costVoucherDraftRecommendation.approvalRequired, true);
});
