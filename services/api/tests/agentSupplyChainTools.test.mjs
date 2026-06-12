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
