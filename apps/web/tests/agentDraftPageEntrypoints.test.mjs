import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const agentCenterPath = fileURLToPath(new URL("../src/pages/AgentCenter.tsx", import.meta.url));
const entryButtonPath = fileURLToPath(new URL("../src/components/AgentDraftEntryButton.tsx", import.meta.url));
const ordersPath = fileURLToPath(new URL("../src/pages/Orders.tsx", import.meta.url));
const vouchersPath = fileURLToPath(new URL("../src/pages/Vouchers.tsx", import.meta.url));
const inventoryMovementsPath = fileURLToPath(new URL("../src/pages/InventoryMovements.tsx", import.meta.url));
const stockCountsPath = fileURLToPath(new URL("../src/pages/StockCounts.tsx", import.meta.url));
const workOrdersPath = fileURLToPath(new URL("../src/pages/ProductionWorkOrders.tsx", import.meta.url));
const materialRequisitionsPath = fileURLToPath(new URL("../src/pages/MaterialRequisitions.tsx", import.meta.url));
const productReceiptsPath = fileURLToPath(new URL("../src/pages/ProductReceipts.tsx", import.meta.url));
const payrollRunsPath = fileURLToPath(new URL("../src/pages/PayrollRuns.tsx", import.meta.url));
const fixedAssetsPath = fileURLToPath(new URL("../src/pages/FixedAssets.tsx", import.meta.url));
const reportRunsPath = fileURLToPath(new URL("../src/pages/ReportRuns.tsx", import.meta.url));
const depreciationRunsPath = fileURLToPath(new URL("../src/pages/DepreciationRuns.tsx", import.meta.url));

test("Agent Center pre-fills draft generation form from page context query parameters", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /useSearchParams/, "Agent Center should read page-context query parameters.");
  assert.match(source, /draftCandidateForm\.setFieldsValue/, "Agent Center should pre-fill the draft candidate form.");
  assert.match(source, /searchParams\.get\('draftType'\)/);
  assert.match(source, /searchParams\.get\('sourceObjectType'\)/);
  assert.match(source, /searchParams\.get\('sourceObjectId'\)/);
  assert.match(source, /searchParams\.get\('userInstruction'\)/);
});

test("Agent draft entry button builds a stable Agent Center URL with business context", () => {
  const source = readFileSync(entryButtonPath, "utf8");

  assert.match(source, /URLSearchParams/);
  assert.match(source, /params\.set\('draftType', draftType\)/);
  assert.match(source, /params\.set\('sourceObjectType', sourceObjectType\)/);
  assert.match(source, /params\.set\('sourceObjectId', sourceObjectId\)/);
  assert.match(source, /params\.set\('userInstruction', userInstruction\)/);
  assert.match(source, /size=\{size\}/);
  assert.match(source, /to=\{`\/agent\?\$\{params\.toString\(\)\}`\}/);
});

test("order, warehouse, production, stock count, voucher, and depreciation pages expose contextual Agent draft entrypoints", () => {
  const ordersSource = readFileSync(ordersPath, "utf8");
  const vouchersSource = readFileSync(vouchersPath, "utf8");
  const movementsSource = readFileSync(inventoryMovementsPath, "utf8");
  const stockCountsSource = readFileSync(stockCountsPath, "utf8");
  const requisitionsSource = readFileSync(materialRequisitionsPath, "utf8");
  const receiptsSource = readFileSync(productReceiptsPath, "utf8");
  const depreciationRunsSource = readFileSync(depreciationRunsPath, "utf8");

  assert.match(ordersSource, /AgentDraftEntryButton/);
  assert.match(ordersSource, /draftType=\{orderType === 'purchase' \? 'purchase_order' : 'sales_order'\}/);
  assert.match(ordersSource, /sourceObjectType=\{`\$\{orderType\}_order_page`\}/);
  assert.match(ordersSource, /Agent 生成订单草稿/);

  assert.match(movementsSource, /AgentDraftEntryButton/);
  assert.match(movementsSource, /draftType="inventory_movement"/);
  assert.match(movementsSource, /sourceObjectType="inventory_movement_page"/);

  assert.match(stockCountsSource, /AgentDraftEntryButton/);
  assert.match(stockCountsSource, /draftType="stock_count"/);
  assert.match(stockCountsSource, /sourceObjectType="stock_count_page"/);

  assert.match(requisitionsSource, /AgentDraftEntryButton/);
  assert.match(requisitionsSource, /draftType="material_requisition"/);
  assert.match(requisitionsSource, /sourceObjectType="material_requisition_page"/);

  assert.match(receiptsSource, /AgentDraftEntryButton/);
  assert.match(receiptsSource, /draftType="product_receipt"/);
  assert.match(receiptsSource, /sourceObjectType="product_receipt_page"/);

  assert.match(vouchersSource, /AgentDraftEntryButton/);
  assert.match(vouchersSource, /draftType="voucher"/);
  assert.match(vouchersSource, /sourceObjectType="voucher_page"/);

  assert.match(depreciationRunsSource, /AgentDraftEntryButton/);
  assert.match(depreciationRunsSource, /draftType="depreciation_run"/);
  assert.match(depreciationRunsSource, /sourceObjectType="depreciation_run_page"/);
  assert.match(depreciationRunsSource, /currentYear/);
  assert.match(depreciationRunsSource, /currentPeriod/);
});

test("order, warehouse, work-order, voucher, payroll, fixed-asset, and report rows pass the selected business record id into Agent draft generation", () => {
  const ordersSource = readFileSync(ordersPath, "utf8");
  const vouchersSource = readFileSync(vouchersPath, "utf8");
  const movementsSource = readFileSync(inventoryMovementsPath, "utf8");
  const workOrdersSource = readFileSync(workOrdersPath, "utf8");
  const payrollRunsSource = readFileSync(payrollRunsPath, "utf8");
  const fixedAssetsSource = readFileSync(fixedAssetsPath, "utf8");
  const reportRunsSource = readFileSync(reportRunsPath, "utf8");

  assert.match(ordersSource, /sourceObjectId=\{record\.id\}/);
  assert.match(ordersSource, /sourceObjectType=\{`\$\{orderType\}_order`\}/);
  assert.match(ordersSource, /根据 \$\{record\.orderNo\} 生成/);

  assert.match(movementsSource, /sourceObjectType="inventory_movement"/);
  assert.match(movementsSource, /sourceObjectId=\{record\.id\}/);
  assert.match(movementsSource, /record\.documentNo/);

  assert.match(vouchersSource, /sourceObjectType="voucher"/);
  assert.match(vouchersSource, /sourceObjectId=\{record\.id\}/);
  assert.match(vouchersSource, /record\.voucherNo/);

  assert.match(payrollRunsSource, /AgentDraftEntryButton/);
  assert.match(payrollRunsSource, /draftType="payroll_allocation"/);
  assert.match(payrollRunsSource, /sourceObjectType="payroll_run"/);
  assert.match(payrollRunsSource, /sourceObjectId=\{row\.id\}/);
  assert.match(payrollRunsSource, /row\.runNo/);

  assert.match(fixedAssetsSource, /AgentDraftEntryButton/);
  assert.match(fixedAssetsSource, /draftType="asset_change"/);
  assert.match(fixedAssetsSource, /sourceObjectType="fixed_asset"/);
  assert.match(fixedAssetsSource, /sourceObjectId=\{row\.id\}/);
  assert.match(fixedAssetsSource, /row\.assetNo/);

  assert.match(reportRunsSource, /AgentDraftEntryButton/);
  assert.match(reportRunsSource, /draftType="report_interpretation"/);
  assert.match(reportRunsSource, /sourceObjectType="report_run"/);
  assert.match(reportRunsSource, /sourceObjectId=\{record\.id\}/);
  assert.match(reportRunsSource, /record\.snapshotHash/);

  assert.match(workOrdersSource, /AgentDraftEntryButton/);
  assert.match(workOrdersSource, /draftType="material_requisition"/);
  assert.match(workOrdersSource, /draftType="product_receipt"/);
  assert.match(workOrdersSource, /sourceObjectType="work_order"/);
  assert.match(workOrdersSource, /sourceObjectId=\{record\.id\}/);
  assert.match(workOrdersSource, /根据 \$\{record\.workOrderNo\} 生成生产领料候选草稿/);
  assert.match(workOrdersSource, /根据 \$\{record\.workOrderNo\} 生成完工入库候选草稿/);
});
