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
  "generate_line_side_replenishment",
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

test("Phase 5 Agents return reviewable APS, rework, outsourcing, traceability, and line-side draft payloads", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCP5A",
      name: "Supply Chain Phase 5 Agents",
      companyName: "Supply Chain Phase 5 Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-phase5-account"
  );
  const accountSetId = accountSet.body.id;

  api.state.salesOrders.set("sales-order:p5", {
    id: "sales-order:p5",
    accountSetId,
    customerId: "customer:p5",
    customerName: "Phase 5 Customer",
    orderNo: "SO-P5-001",
    orderDate: "2026-06-13",
    requiredDate: "2026-06-20",
    status: "approved",
    currency: "CNY",
    exchangeRate: 1,
    totalAmount: 1000,
    lines: [
      {
        id: "sales-order-line:p5:1",
        lineNo: 1,
        itemCode: "FG-P5",
        itemName: "Finished Phase 5",
        quantity: 10,
        unitPrice: 100,
        totalAmount: 1000,
        shippedQuantity: 2
      }
    ]
  });
  api.state.boms.set("bom:fg-p5", {
    id: "bom:fg-p5",
    accountSetId,
    productItemCode: "FG-P5",
    productItemName: "Finished Phase 5",
    version: "V1",
    status: "approved",
    lines: [
      {
        id: "bom-line:p5-mat",
        bomId: "bom:fg-p5",
        componentItemCode: "MAT-P5",
        componentItemName: "Material Phase 5",
        lineNo: 1,
        quantity: 2,
        scrapRate: 0
      }
    ]
  });
  api.state.workOrders.set("work-order:p5", {
    id: "work-order:p5",
    accountSetId,
    workOrderNo: "WO-P5-001",
    productItemCode: "FG-P5",
    productItemName: "Finished Phase 5",
    bomId: "bom:fg-p5",
    plannedQuantity: 8,
    completedQuantity: 1,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6
  });
  api.state.inventoryBalances.set("balance:p5-mat", {
    id: "balance:p5-mat",
    accountSetId,
    itemCode: "MAT-P5",
    itemName: "Material Phase 5",
    warehouseCode: "MAIN",
    quantity: 3,
    lockedQuantity: 0,
    amount: 30,
    batchNo: "BATCH-P5-MAT"
  });
  api.state.productionPlans.set("production-plan:p5", {
    id: "production-plan:p5",
    accountSetId,
    planNo: "MPS-P5-001",
    fiscalYear: 2026,
    periodNo: 6,
    status: "draft",
    sourceType: "agent",
    lines: [
      {
        id: "production-plan-line:p5:1",
        productionPlanId: "production-plan:p5",
        lineNo: 1,
        productItemCode: "FG-P5",
        productItemName: "Finished Phase 5",
        plannedQuantity: 8,
        plannedStartDate: "2026-06-14",
        plannedFinishDate: "2026-06-20",
        status: "planned"
      }
    ]
  });
  api.state.traceRules.set("trace-rule:p5", {
    id: "trace-rule:p5",
    accountSetId,
    code: "TRACE-P5",
    name: "Phase 5 batch trace",
    objectType: "batch",
    direction: "both",
    isEnabled: true
  });
  api.state.lineSideWarehouseConfigs.set("line-side:p5", {
    id: "line-side:p5",
    accountSetId,
    code: "LS-P5",
    name: "Phase 5 Line Side",
    productionLineCode: "LINE-P5",
    mainWarehouseCode: "MAIN",
    isEnabled: true
  });

  const productionPlan = await request(
    api,
    "POST",
    "/agent-tools/generate_production_plan/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "sales-order:p5", evidenceRefs: ["sales-order:p5"] },
    "agent-phase5-production-plan"
  );
  const workOrders = await request(
    api,
    "POST",
    "/agent-tools/generate_work_orders_from_plan/invoke",
    { accountSetId, fiscalYear: 2026, periodNo: 6, dryRun: true, sourceObjectId: "production-plan:p5", evidenceRefs: ["production-plan:p5"] },
    "agent-phase5-work-orders"
  );
  const rework = await request(
    api,
    "POST",
    "/agent-tools/generate_rework_plan/invoke",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      dryRun: true,
      sourceObjectId: "work-order:p5",
      evidenceRefs: ["quality-exception:p5"],
      payload: { reasonCode: "quality_exception", quantity: 2, originalBatchNo: "BATCH-P5-FG" }
    },
    "agent-phase5-rework-plan"
  );
  const outsourcing = await request(
    api,
    "POST",
    "/agent-tools/generate_outsourcing_order/invoke",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      dryRun: true,
      sourceObjectId: "work-order:p5",
      evidenceRefs: ["capacity-risk:p5"],
      payload: { supplierId: "supplier:p5", supplierName: "Phase 5 Supplier", processName: "Coating", quantity: 4 }
    },
    "agent-phase5-outsourcing-order"
  );
  const traceability = await request(
    api,
    "POST",
    "/agent-tools/trace_material_batch/invoke",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      dryRun: true,
      sourceObjectId: "trace-rule:p5",
      evidenceRefs: ["inventory-batch:BATCH-P5-MAT"],
      payload: { batchNo: "BATCH-P5-MAT", direction: "backward" }
    },
    "agent-phase5-traceability"
  );
  const lineSide = await request(
    api,
    "POST",
    "/agent-tools/generate_line_side_replenishment/invoke",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      dryRun: true,
      sourceObjectId: "line-side:p5",
      evidenceRefs: ["work-order:p5"],
      payload: { workOrderId: "work-order:p5", itemCode: "MAT-P5", quantity: 13 }
    },
    "agent-phase5-line-side"
  );

  assert.equal(productionPlan.status, 201);
  assert.equal(productionPlan.body.result.dryRunResult.draftPayload.productionPlanDraft.documentType, "production_plan_draft");
  assert.equal(productionPlan.body.result.dryRunResult.draftPayload.productionPlanDraft.lines[0].sourceOrderNo, "SO-P5-001");
  assert.equal(productionPlan.body.result.dryRunResult.draftPayload.productionPlanDraft.lines[0].plannedQuantity, 8);

  assert.equal(workOrders.status, 201);
  assert.equal(workOrders.body.result.dryRunResult.draftPayload.workOrderDrafts.documentType, "work_order_draft_batch");
  assert.equal(workOrders.body.result.dryRunResult.draftPayload.workOrderDrafts.workOrderDrafts[0].workOrderNo, "WO-MPS-P5-001-01");

  assert.equal(rework.status, 201);
  assert.equal(rework.body.result.dryRunResult.draftPayload.reworkPlanDraft.documentType, "rework_plan_draft");
  assert.equal(rework.body.result.dryRunResult.draftPayload.reworkPlanDraft.originalBatchNo, "BATCH-P5-FG");
  assert.equal(rework.body.result.dryRunResult.draftPayload.reworkPlanDraft.materialLines[0].itemCode, "MAT-P5");

  assert.equal(outsourcing.status, 201);
  assert.equal(outsourcing.body.result.dryRunResult.draftPayload.outsourcingOrderDraft.documentType, "outsourcing_order_draft");
  assert.equal(outsourcing.body.result.dryRunResult.draftPayload.outsourcingOrderDraft.supplierName, "Phase 5 Supplier");
  assert.equal(outsourcing.body.result.dryRunResult.draftPayload.outsourcingOrderDraft.materialIssueLines[0].itemCode, "MAT-P5");

  assert.equal(traceability.status, 201);
  assert.equal(traceability.body.result.dryRunResult.draftPayload.traceabilityReport.documentType, "traceability_report");
  assert.equal(traceability.body.result.dryRunResult.draftPayload.traceabilityReport.batchNo, "BATCH-P5-MAT");
  assert.ok(traceability.body.result.dryRunResult.draftPayload.traceabilityReport.impactedObjects.length >= 1);

  assert.equal(lineSide.status, 201);
  assert.equal(lineSide.body.result.dryRunResult.draftPayload.lineSideReplenishmentDraft.documentType, "line_side_replenishment_draft");
  assert.equal(lineSide.body.result.dryRunResult.draftPayload.lineSideReplenishmentDraft.lineSideWarehouseCode, "LS-P5");
  assert.equal(lineSide.body.result.dryRunResult.draftPayload.lineSideReplenishmentDraft.lines[0].replenishmentQuantity, 13);
});

test("Phase 5 Agent draft candidates convert into non-mutating manufacturing previews after human review", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCP5C",
      name: "Supply Chain Phase 5 Conversions",
      companyName: "Supply Chain Phase 5 Conversion Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-phase5-conversion-account"
  );
  const accountSetId = accountSet.body.id;
  const conversions = [
    {
      draftType: "production_plan",
      sourceObjectType: "production_plan_page",
      responseField: "productionPlanDraft",
      convertedObjectType: "production_plan_draft",
      reviewedDraftPayload: {
        documentType: "production_plan_draft",
        fiscalYear: 2026,
        periodNo: 6,
        lines: [{ productItemCode: "FG-CNV", productItemName: "Finished Conversion", plannedQuantity: 6 }]
      }
    },
    {
      draftType: "rework_order",
      sourceObjectType: "rework_order_page",
      responseField: "reworkOrderDraft",
      convertedObjectType: "rework_order_draft",
      reviewedDraftPayload: {
        documentType: "rework_order_draft",
        itemCode: "FG-CNV",
        itemName: "Finished Conversion",
        quantity: 1,
        reasonCode: "quality_exception"
      }
    },
    {
      draftType: "outsourcing_order",
      sourceObjectType: "outsourcing_order_page",
      responseField: "outsourcingOrderDraft",
      convertedObjectType: "outsourcing_order_draft",
      reviewedDraftPayload: {
        documentType: "outsourcing_order_draft",
        supplierName: "Conversion Supplier",
        itemCode: "FG-CNV",
        itemName: "Finished Conversion",
        quantity: 3,
        processName: "Coating"
      }
    },
    {
      draftType: "traceability_report",
      sourceObjectType: "traceability_page",
      responseField: "traceabilityReportDraft",
      convertedObjectType: "traceability_report_draft",
      reviewedDraftPayload: {
        documentType: "traceability_report_draft",
        batchNo: "BATCH-CNV",
        direction: "backward",
        impactedObjects: [{ objectType: "inventory_balance", objectId: "balance:cnv" }]
      }
    },
    {
      draftType: "line_side_replenishment",
      sourceObjectType: "line_side_warehouse_page",
      responseField: "lineSideReplenishmentDraft",
      convertedObjectType: "line_side_replenishment_draft",
      reviewedDraftPayload: {
        documentType: "line_side_replenishment_draft",
        lineSideWarehouseCode: "LS-CNV",
        mainWarehouseCode: "MAIN",
        lines: [{ itemCode: "MAT-CNV", replenishmentQuantity: 5 }]
      }
    }
  ];

  for (const conversion of conversions) {
    const candidate = await request(
      api,
      "POST",
      "/agent/draft-candidates",
      {
        accountSetId,
        fiscalPeriodId: "period:scp5c:2026:6",
        draftType: conversion.draftType,
        sourceObjectType: conversion.sourceObjectType,
        userInstruction: `Generate ${conversion.draftType} preview.`,
        evidenceRefs: [`${conversion.sourceObjectType}:evidence`],
        dryRun: true
      },
      `agent-phase5-conversion-candidate-${conversion.draftType}`
    );
    const converted = await request(
      api,
      "POST",
      `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
      {
        reviewedBy: "phase5-reviewer",
        reviewedDraftPayload: conversion.reviewedDraftPayload
      },
      `agent-phase5-conversion-${conversion.draftType}`
    );

    assert.equal(candidate.status, 201);
    assert.equal(converted.status, 201, `${conversion.draftType} should convert after review.`);
    assert.equal(converted.body.documentType, conversion.reviewedDraftPayload.documentType);
    assert.equal(converted.body.status, "draft");
    assert.equal(converted.body.sourceType, "agent_draft");
    assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
    assert.equal(converted.body.approvalRequired, true);
    assert.deepEqual(converted.body.reviewedDraftPayload, conversion.reviewedDraftPayload);
    assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
    assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, conversion.convertedObjectType);
    assert.ok(api.state.auditLogs.some((log) => log.action === "agent.draft_candidate.convert" && log.objectId === converted.body.id));
  }
});

test("Agent draft conversion blocks inventory-impacting production drafts in closed periods", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "SCPCG",
      name: "Supply Chain Period Control",
      companyName: "Supply Chain Period Control Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 6
    },
    "agent-period-control-account"
  );
  const accountSetId = accountSet.body.id;
  api.state.periods.set("period:scpcg:2026:6", {
    id: "period:scpcg:2026:6",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 6,
    status: "closed"
  });
  api.state.inventoryItems.set("item:mat-period", {
    id: "item:mat-period",
    accountSetId,
    code: "MAT-PERIOD",
    name: "Material Period",
    itemType: "material",
    unit: "PCS",
    costMethod: "moving_average"
  });
  api.state.warehouses.set("warehouse:period", {
    id: "warehouse:period",
    accountSetId,
    code: "MAIN",
    name: "Main Warehouse",
    warehouseType: "main",
    locations: []
  });
  api.state.workOrders.set("work-order:period", {
    id: "work-order:period",
    accountSetId,
    workOrderNo: "WO-PERIOD",
    productItemId: "item:fg-period",
    productItemCode: "FG-PERIOD",
    productItemName: "Finished Period",
    plannedQuantity: 1,
    status: "released",
    fiscalYear: 2026,
    periodNo: 6
  });

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "material_requisition",
      sourceObjectType: "work_order",
      sourceObjectId: "work-order:period",
      userInstruction: "Generate material issue draft in a closed period.",
      evidenceRefs: ["work-order:period"],
      dryRun: true
    },
    "agent-period-control-candidate"
  );
  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "period-reviewer",
      resolvedUnmatchedItems: (candidate.body.unmatchedItems ?? []).map((item) => ({
        field: item.field,
        resolution: "manual_review",
        resolvedValue: "reviewed"
      })),
      reviewedDraftPayload: {
        documentType: "material_requisition",
        workOrderId: "work-order:period",
        fiscalYear: 2026,
        periodNo: 6,
        lines: [{ componentItemId: "item:mat-period", warehouseId: "warehouse:period", quantity: 1 }]
      }
    },
    "agent-period-control-convert"
  );

  assert.equal(candidate.status, 201);
  assert.equal(converted.status, 409, JSON.stringify(converted.body));
  assert.equal(converted.body.code, "AGENT_DRAFT_PERIOD_CLOSED");
  assert.equal(api.state.materialRequisitions.size, 0);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "candidate");
});
