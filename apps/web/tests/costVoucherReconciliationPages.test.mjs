import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const voucherPath = fileURLToPath(new URL("../src/pages/CostVoucherDrafts.tsx", import.meta.url));
const reconciliationPath = fileURLToPath(new URL("../src/pages/InventoryReconciliation.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const voucherSource = readFileSync(voucherPath, "utf8");
const reconciliationSource = readFileSync(reconciliationPath, "utf8");

test("web app exposes Phase 3 cost voucher and inventory reconciliation pages", () => {
  assert.match(appSource, /path="\/cost-voucher-drafts"/, "Cost voucher draft route should be stable.");
  assert.match(appSource, /path="\/inventory-reconciliation"/, "Inventory reconciliation route should be stable.");
  assert.match(appSource, /to="\/cost-voucher-drafts"/, "Cost voucher drafts should be reachable from navigation.");
  assert.match(appSource, /to="\/inventory-reconciliation"/, "Inventory reconciliation should be reachable from navigation.");
  assert.match(voucherSource, /api\.get\(`\/cost-voucher-drafts\?/, "Cost voucher page should list drafts.");
  assert.match(voucherSource, /api\.post\('\/cost-voucher-drafts'/, "Cost voucher page should create drafts.");
  assert.match(voucherSource, /approvalRequired/, "Cost voucher page should show human approval requirement.");
  assert.match(reconciliationSource, /api\.get\(`\/inventory-reconciliation\?/, "Reconciliation page should query reconciliation.");
  assert.match(reconciliationSource, /differenceAmount/, "Reconciliation page should show differences.");
});
